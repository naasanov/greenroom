// Greenroom service worker: caches hashed build assets and per-gig stage pages.
const SHELL_CACHE = "greenroom-shell-v1";
const STAGE_PAGE = /^\/gigs\/[^/]+\/stage$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("greenroom-shell-") && n !== SHELL_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (!STAGE_PAGE.test(url.pathname)) {
    return;
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, url.pathname));
  } else if (url.searchParams.has("_rsc")) {
    // The route payload for runtime params, stored without its changing hash.
    event.respondWith(networkFirst(request, url.pathname + "?rsc"));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(request, key) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}
