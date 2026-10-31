import { getStore } from "@netlify/blobs";
import { checkAdmin, json } from "../lib/auth.mjs";

const STATUSES = ["available", "sold"];
const str = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const optStr = (v, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

function cleanPhoto(p) {
  const src = str(p && p.src, 300);
  // Photos are backend-only: item data holds short backend references
  // (/api/img/...) from uploads. Legacy bundled paths are still tolerated
  // on read so old saved data never breaks, but nothing bundled is produced.
  if (!/^(assets\/[\w.\-\/]+|\/api\/img\/[a-z0-9\-]+)$/i.test(src)) return null;
  return {
    src,
    kind: str(p.kind, 60) || "Plain",
    label: str(p.label, 200),
    note: str(p.note, 300),
  };
}

const FRAMED_VALUES = ["framed", "unframed"];

function cleanItem(it) {
  if (!it || typeof it !== "object") return null;
  const id = str(it.id, 60);
  const name = str(it.name, 200);
  const category = str(it.category, 80);
  const photos = Array.isArray(it.photos) ? it.photos.map(cleanPhoto).filter(Boolean) : [];
  // An item with no photos is a legitimate "photos coming soon" state, not
  // an error: photos are added later in the back end (Admin upload -> Blobs).
  if (!id || !name || !category) return null;
  const price = Number(it.price);
  const stock = Math.max(1, Math.floor(Number(it.stock) || 1));
  const out = {
    id,
    category,
    name,
    made: str(it.made, 200),
    hooks: optStr(it.hooks),
    status: STATUSES.includes(it.status) ? it.status : "available",
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    desc: str(it.desc, 2000),
    photos,
  };
  const detail = optStr(it.detail);
  if (detail) out.detail = detail;
  // Size survives end to end: the admin form sends it, this keeps it, and the
  // storefront shows it. Without this line, sizes were silently dropped here.
  const size = optStr(it.size, 80);
  if (size) out.size = size;
  // Item code: the owner's own short code (e.g. K-01). Optional; a blank
  // code stays blank and nothing shows on the listing.
  const code = str(it.code, 40);
  if (code) out.code = code;
  // Framed only means something for Photo Prints; ignore it elsewhere so a
  // stray value can never leak onto another category.
  if (category === "Photo Prints") {
    const framed = typeof it.framed === "string" ? it.framed.trim().toLowerCase() : "";
    if (FRAMED_VALUES.includes(framed)) out.framed = framed;
  }
  if (stock > 1) out.stock = stock;
  return out;
}

export default async (req) => {
  const store = getStore({ name: "shop", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Password check used by the admin login screen.
    if (url.searchParams.has("check")) {
      return checkAdmin(req) || json({ ok: true });
    }
    // Public: the storefront reads this. items === null means "never saved yet".
    const data = await store.get("items", { type: "json" });
    return json({ items: data && Array.isArray(data.items) ? data.items : null }, 200, {
      "cache-control": "no-cache",
    });
  }

  if (req.method === "PUT") {
    const denied = checkAdmin(req);
    if (denied) return denied;

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    if (!body || !Array.isArray(body.items) || body.items.length > 500) {
      return json({ error: "Expected { items: [...] } with at most 500 items." }, 400);
    }
    const items = body.items.map(cleanItem);
    const bad = items.findIndex((x) => x === null);
    if (bad !== -1) {
      return json({ error: `Item #${bad + 1} is missing a name, category, or id.` }, 400);
    }
    const ids = new Set(items.map((i) => i.id));
    if (ids.size !== items.length) return json({ error: "Two items share the same id." }, 400);

    await store.setJSON("items", { items, savedAt: new Date().toISOString() });
    return json({ ok: true, count: items.length });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/items" };
