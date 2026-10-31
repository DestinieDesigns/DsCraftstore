import { getStore } from "@netlify/blobs";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { checkAdmin, json } from "../lib/auth.mjs";

const ORDER_STATUSES = ["pending_review", "approved", "invoiced", "paid", "ready", "completed", "cancelled", "expired"];
const str = (v, max = 1000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const now = () => new Date().toISOString();
const id = () => "DD-" + new Date().toISOString().slice(0,10).replaceAll("-", "") + "-" + randomUUID().slice(0,8).toUpperCase();

async function getInventory() {
  const shop = getStore({ name: "shop", consistency: "strong" });
  const saved = await shop.get("items", { type: "json" });
  if (saved && Array.isArray(saved.items)) return { store: shop, items: saved.items, saved: true };
  try {
    const raw = await readFile(new URL("../../public/items-seed.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw);
    return { store: shop, items: Array.isArray(parsed.items) ? parsed.items : [], saved: false };
  } catch {
    return { store: shop, items: [], saved: false };
  }
}
async function allOrders(orderStore) {
  const listed = await orderStore.list({ prefix: "order:" });
  const out = [];
  for (const blob of listed.blobs || []) {
    const order = await orderStore.get(blob.key, { type: "json" });
    if (order) out.push(order);
  }
  return out.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function saveOrder(orderStore, order) {
  await orderStore.setJSON("order:" + order.id, order);
}
function reservedStatuses() { return new Set(["approved", "invoiced", "paid", "ready"]); }
// EVENT MODEL: the ONLY automatic expiry in this system is the 30-minute
// event invoice void. An in-person pickup order is invoiced the moment the
// shopper confirms, and if it is not paid at the table within 30 minutes it
// becomes VOID and its items are released (expired is not a reserving
// status, so availableInventory stops counting it). Shipping requests are
// never auto-expired: the owner reviews and confirms them by hand.
const EVENT_INVOICE_MINUTES = 30;
const EVENT_INVOICE_MS = EVENT_INVOICE_MINUTES * 60 * 1000;
function invoiceExpiresAt(order) {
  if (order.expiresAt) return Date.parse(order.expiresAt);
  // Backwards compatibility for invoices issued before expiresAt existed.
  if (order.fulfilment === "pickup" && order.invoiceSentAt) return Date.parse(order.invoiceSentAt) + EVENT_INVOICE_MS;
  return NaN;
}
async function expireDueOrders(orderStore, orders = null) {
  const list = orders || await allOrders(orderStore);
  const time = Date.now();
  let changed = false;
  for (const order of list) {
    if (order.status !== "invoiced") continue;
    const due = invoiceExpiresAt(order);
    if (Number.isNaN(due) || time < due) continue;
    order.status = "expired"; order.expiredAt = now(); order.updatedAt = now();
    order.expirationReason = "Invoice not paid in person within 30 minutes";
    order.history = [...(order.history || []), { status: "expired", at: order.expiredAt, note: order.expirationReason }];
    await saveOrder(orderStore, order); changed = true;
  }
  return { orders: list, changed };
}
function orderQuantities(order) {
  const sums = new Map();
  for (const item of order.items || []) sums.set(String(item.id), (sums.get(String(item.id)) || 0) + Number(item.qty || 0));
  return sums;
}
async function availableInventory(itemId, inventory, orders, excludeId = "") {
  const item = inventory.find(x => String(x.id) === String(itemId));
  if (!item || item.status === "sold") return 0;
  const stock = Math.max(0, Math.floor(Number(item.stock) || 1));
  let reserved = 0;
  for (const order of orders) {
    if (order.id === excludeId || !reservedStatuses().has(order.status)) continue;
    reserved += orderQuantities(order).get(String(itemId)) || 0;
  }
  return Math.max(0, stock - reserved);
}

export default async (req) => {
  const orderStore = getStore({ name: "orders", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid order request." }, 400); }
    const customerName = str(body.customerName, 120);
    const contact = str(body.contact, 200);
    const fulfilment = body.fulfilment === "shipping" ? "shipping" : body.fulfilment === "pickup" ? "pickup" : "";
    const itemsIn = Array.isArray(body.items) ? body.items : [];
    if (!customerName || !contact || !fulfilment || !itemsIn.length || itemsIn.length > 50) return json({ error: "Please provide your name, contact details, fulfillment choice, and at least one item." }, 400);
    if (fulfilment === "shipping" && (!str(body.address,300) || !str(body.city,100) || !str(body.state,40) || !str(body.zip,20))) return json({ error: "Please complete the shipping address." }, 400);

    const inventory = await getInventory();
    const orders = (await expireDueOrders(orderStore)).orders;
    const cleaned = [];
    for (const raw of itemsIn) {
      const itemId = str(raw.id, 80);
      const qty = Math.max(1, Math.min(99, Math.floor(Number(raw.qty) || 1)));
      const actual = inventory.items.find(it => String(it.id) === itemId);
      if (inventory.items.length && (!actual || actual.status === "sold")) return json({ error: "One of the requested items is no longer available. Please refresh the store and try again." }, 409);
      const price = actual ? Number(actual.price) || 0 : Math.max(0, Number(raw.price) || 0);
      const name = actual ? str(actual.name, 200) : str(raw.name, 200);
      if (!itemId || !name) return json({ error: "An item in this request is invalid." }, 400);
      if (actual) {
        const available = await availableInventory(itemId, inventory.items, orders);
        if (qty > available) return json({ error: "There is not enough available stock for " + name + ". Please update your cart and try again." }, 409);
      }
      // Carry the size/framing onto the invoice line so shoppers and the
      // owner see exactly what was ordered (prints especially).
      const line = { id: itemId, name, price, qty, lineTotal: Math.round(price * qty * 100) / 100 };
      if (actual && actual.size) line.size = String(actual.size);
      if (actual && actual.framed) line.framed = String(actual.framed);
      if (actual && actual.code) line.code = String(actual.code);
      cleaned.push(line);
    }
    const subtotal = Math.round(cleaned.reduce((sum, it) => sum + it.lineTotal, 0) * 100) / 100;
    // EVENT MODEL: an in-person pickup order IS an invoice the moment the
    // shopper confirms — no owner review step at the table. It lives for
    // 30 minutes, then voids. A shipping request still waits for the owner
    // to confirm the shipping cost and final total.
    const isPickup = fulfilment === "pickup";
    const issuedAt = now();
    const order = {
      id: id(), createdAt: issuedAt, updatedAt: issuedAt,
      status: isPickup ? "invoiced" : "pending_review",
      customerName, contact, fulfilment,
      address: fulfilment === "shipping" ? str(body.address,300) : "",
      city: fulfilment === "shipping" ? str(body.city,100) : "",
      state: fulfilment === "shipping" ? str(body.state,40) : "",
      zip: fulfilment === "shipping" ? str(body.zip,20) : "",
      note: str(body.note,1000), items: cleaned, subtotal,
      shippingCost: null, finalTotal: isPickup ? subtotal : null,
      inventorySource: inventory.saved ? "saved website inventory" : "bundled website inventory; confirm before invoicing",
      policy: isPickup
        ? { payment: "in-person", invoiceMinutes: EVENT_INVOICE_MINUTES, deductInventoryOn: "completed" }
        : { payment: "to be confirmed by owner", deductInventoryOn: "completed" },
      history: [{ status: isPickup ? "invoiced" : "pending_review", at: issuedAt,
        note: isPickup ? "Event invoice issued — pay in person within 30 minutes" : "Shipping request submitted — owner to confirm shipping cost" }]
    };
    if (isPickup) {
      order.invoiceSentAt = issuedAt;
      order.expiresAt = new Date(Date.parse(issuedAt) + EVENT_INVOICE_MS).toISOString();
    }
    await saveOrder(orderStore, order);
    return json({ ok: true, order: { id: order.id, createdAt: order.createdAt, status: order.status,
      expiresAt: order.expiresAt || null, items: order.items, subtotal: order.subtotal } }, 201);
  }

  const denied = checkAdmin(req);
  if (denied) return denied;
  if (req.method === "GET") {
    const { orders } = await expireDueOrders(orderStore);
    return json({ orders });
  }
  if (req.method === "PATCH") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
    const orderId = str(body.id, 80);
    const status = str(body.status, 40);
    if (!orderId || !ORDER_STATUSES.includes(status)) return json({ error: "Order ID or status is invalid." }, 400);
    const order = await orderStore.get("order:" + orderId, { type: "json" });
    if (!order) return json({ error: "Order not found." }, 404);
    const inventory = await getInventory();
    const orders = (await allOrders(orderStore)).filter(o => o.id !== orderId);
    const previous = order.status;
    const allowedNext = {
      pending_review: ["pending_review", "approved", "cancelled", "expired"],
      approved: ["approved", "invoiced", "cancelled"],
      invoiced: ["invoiced", "paid", "cancelled", "expired"],
      paid: ["paid", "ready", "completed"],
      ready: ["ready", "completed"],
      completed: ["completed"], cancelled: ["cancelled"], expired: ["expired"]
    };
    if (!(allowedNext[previous] || []).includes(status)) return json({ error: `Cannot change an order from ${previous} to ${status}.` }, 409);
    if (previous === "completed") {
      if (status === "completed" && order.inventoryDeductedAt) return json({ ok: true, order, alreadyCompleted: true });
      return json({ error: "This order is already completed. Its inventory has already been deducted." }, 409);
    }
    if (status === "approved" && previous === "pending_review") {
      for (const line of order.items) {
        const available = await availableInventory(line.id, inventory.items, orders);
        if (line.qty > available) return json({ error: "Cannot approve: insufficient available stock for " + line.name + "." }, 409);
      }
      order.approvedAt = now();
    }
    if (status === "invoiced") {
      // Pickup orders are born invoiced (no approval step), so re-marking
      // one as invoiced must not demand an approval that never happens.
      if (!order.approvedAt && previous !== "approved" && previous !== "invoiced") return json({ error: "Approve the request before marking an invoice sent." }, 409);
      order.invoiceSentAt = now();
      // Pickup invoices always carry the 30-minute clock, whenever issued.
      if (order.fulfilment === "pickup") order.expiresAt = new Date(Date.now() + EVENT_INVOICE_MS).toISOString();
    }
    if (status === "paid") order.paidAt = now();
    if (status === "ready") {
      if (!order.paidAt && previous !== "paid") return json({ error: "Mark the order Paid before Ready." }, 409);
      order.readyAt = now();
    }
    if (status === "completed") {
      if (previous !== "paid" && previous !== "ready") return json({ error: "Mark the order Paid or Ready before completing it." }, 409);
      if (!inventory.saved) return json({ error: "Inventory has not yet been saved in the website inventory store. Confirm the current live inventory in Admin and save it before completing this order, so the system does not overwrite your correct inventory with starter data." }, 409);
      if (!order.inventoryDeductedAt) {
        const items = inventory.items.map(it => ({ ...it, photos: Array.isArray(it.photos) ? it.photos : [] }));
        for (const line of order.items) {
          const target = items.find(it => String(it.id) === String(line.id));
          if (!target) return json({ error: "Inventory item missing: " + line.name + ". No stock was changed." }, 409);
          const currentStock = Math.max(1, Math.floor(Number(target.stock) || 1));
          const next = currentStock - Number(line.qty);
          if (next < 0) return json({ error: "Not enough inventory remains for " + line.name + ". No stock was changed." }, 409);
          if (next === 0) { target.status = "sold"; delete target.stock; }
          else { target.stock = next; target.status = "available"; }
        }
        await inventory.store.setJSON("items", { items, savedAt: now() });
        order.inventoryDeductedAt = now();
      }
      order.completedAt = now();
    }
    if (status === "cancelled" || status === "expired") order.closedAt = now();
    order.status = status; order.updatedAt = now();
    order.history = [...(order.history || []), { status, at: order.updatedAt, note: status === "paid" ? (order.fulfilment === "pickup" ? "Payment received in person" : "Payment confirmed by owner") : status === "completed" ? "Order completed; website inventory deducted" : status === "expired" ? "Order expired — event invoice not paid within 30 minutes" : status === "cancelled" ? "Order cancelled" : "Status updated by Admin" }];
    await saveOrder(orderStore, order);
    return json({ ok: true, order });
  }
  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/orders" };
