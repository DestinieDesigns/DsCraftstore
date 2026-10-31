import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();

// Returns null when the request is allowed, otherwise a Response to send back.
export function checkAdmin(req) {
  const expected = Netlify.env.get("ADMIN_PASSWORD");
  if (!expected) {
    return json({ error: "ADMIN_PASSWORD is not set in Netlify environment variables." }, 500);
  }
  const given = req.headers.get("x-admin-password") || "";
  if (!timingSafeEqual(sha(given), sha(expected))) {
    return json({ error: "Wrong password." }, 401);
  }
  return null;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}
