import { getStore } from "@netlify/blobs";

const now = () => new Date().toISOString();
const EVENT_INVOICE_MS = 30 * 60 * 1000;

// Scheduled job (every 15 minutes): void event invoices that were not paid
// in person within 30 minutes of being issued. This is the ONLY automatic
// expiry in the system. Shipping requests are never auto-expired — the owner
// reviews and confirms them by hand. Note the schedule granularity: an
// invoice can stay listed up to ~15 minutes past its 30-minute mark before
// this job runs, but the shopper-facing countdown already shows VOID at
// exactly 30:00, and expired invoices release their stock reservation.
export default async () => {
  const store = getStore({ name: "orders", consistency: "strong" });
  const listed = await store.list({ prefix: "order:" });
  const expired = [];
  for (const blob of listed.blobs || []) {
    const order = await store.get(blob.key, { type: "json" });
    if (!order || order.status !== "invoiced") continue;
    const due = order.expiresAt
      ? Date.parse(order.expiresAt)
      : (order.fulfilment === "pickup" && order.invoiceSentAt
        ? Date.parse(order.invoiceSentAt) + EVENT_INVOICE_MS
        : NaN);
    if (Number.isNaN(due) || Date.now() < due) continue;
    order.status = "expired";
    order.expiredAt = now();
    order.updatedAt = now();
    order.expirationReason = "Invoice not paid in person within 30 minutes";
    order.history = [...(order.history || []), { status: "expired", at: order.expiredAt, note: order.expirationReason }];
    await store.setJSON(blob.key, order);
    expired.push(order.id);
  }
  return new Response(JSON.stringify({ ok: true, expired, checkedAt: now() }), { headers: { "content-type": "application/json" } });
};
export const config = { schedule: "*/15 * * * *" };
