import { getStore } from "@netlify/blobs";

export default async (req) => {
  const key = new URL(req.url).pathname.split("/").pop() || "";
  if (!/^[a-z0-9\-]+$/.test(key)) return new Response("Not found", { status: 404 });

  const images = getStore({ name: "images", consistency: "strong" });
  const entry = await images.getWithMetadata(key, { type: "arrayBuffer" });
  if (!entry) return new Response("Not found", { status: 404 });

  return new Response(entry.data, {
    headers: {
      "content-type": (entry.metadata && entry.metadata.contentType) || "image/jpeg",
      // Each upload gets a unique key, so it is safe to cache forever.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

export const config = { path: "/api/img/*" };
