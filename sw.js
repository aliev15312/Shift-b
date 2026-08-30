const CACHE = "shift-b-v5";
const CORE = ["./", "./index.html", "./manifest.webmanifest"];
const NET_TIMEOUT = 2000;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function store(cache, req, res) {
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then((res) => store(cache, req, res)).catch(() => null);

    // The page itself: fresh when the network answers quickly, cached otherwise.
    if (req.mode === "navigate") {
      const timed = new Promise((r) => setTimeout(() => r(null), NET_TIMEOUT));
      const winner = await Promise.race([network, timed]);
      if (winner) return winner;

      const cached = (await cache.match(req, { ignoreSearch: true })) ||
                     (await cache.match("./index.html")) ||
                     (await cache.match("./"));
      if (cached) { e.waitUntil(network); return cached; }
      return (await network) || Response.error();
    }

    // Everything else: cache first, refreshed in the background.
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) { e.waitUntil(network); return cached; }
    return (await network) || Response.error();
  })());
});
