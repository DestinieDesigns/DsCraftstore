import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { checkAdmin, json } from "../lib/auth.mjs";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const denied = checkAdmin(req);
  if (denied) return denied;

  const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES[type]) return json({ error: "Please upload a JPG, PNG or WebP image." }, 415);

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: "Empty file." }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: "Image is over 5 MB." }, 413);

  const key = `${Date.now().toString(36)}-${randomBytes(5).toString("hex")}`;
  const images = getStore({ name: "images", consistency: "strong" });
  await images.set(key, buf, { metadata: { contentType: type } });
  return json({ src: `/api/img/${key}` });
};

export const config = { path: "/api/upload" };
