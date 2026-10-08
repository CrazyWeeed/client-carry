// Offline cache for the app shell and assets. Data itself lives in localStorage and is never touched here.
const CACHE = "field-connect-v1";

self.addEventListener("install", () => {
  // Do NOT skip waiting automatically: the new version only takes over when the user taps "Atualizar".
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(req.mode === "navigate" ? networkFirstPage(req) : staleWhileRevalidate(req));
});

// Pages: try the network and remember the page; offline, serve the remembered copy.
async function networkFirstPage(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req)) || (await cache.match("/"));
    return hit || new Response("Sem conexão e esta página ainda não foi guardada.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

// Assets (JS, CSS, images): serve from cache at once, refresh in the background.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await fresh) || new Response("", { status: 504 });
}
