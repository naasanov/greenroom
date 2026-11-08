// Greenroom service worker: caches build assets, visited pages and per-gig stage pages.
const SHELL_CACHE = "greenroom-shell-v1";
const OFFLINE_PAGE = "/offline.html";
const STAGE_PAGE = /^\/gigs\/[^/]+\/stage$/;
const UUID_TAIL =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/stage$)/i;

// Slug and bare-uuid URLs share one cache entry, keyed by the bare uuid.
function stageKey(pathname) {
  const id = UUID_TAIL.exec(pathname);
  return id ? `/gigs/${id[0]}/stage` : pathname;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(OFFLINE_PAGE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

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
  } else if (request.mode === "navigate") {
    if (url.pathname.startsWith("/auth/") || url.pathname === OFFLINE_PAGE)
      return;
    const key = STAGE_PAGE.test(url.pathname)
      ? stageKey(url.pathname)
      : url.pathname;
    event.respondWith(networkFirst(request, key, true));
  } else if (!STAGE_PAGE.test(url.pathname)) {
    return;
  } else if (url.searchParams.has("_rsc")) {
    // The route payload for runtime params, stored without its changing hash.
    event.respondWith(networkFirst(request, stageKey(url.pathname) + "?rsc"));
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

// Redirected responses are never stored; they cannot answer a navigation.
async function networkFirst(request, key, isPage = false) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreVary: true });
    if (hit) return hit;
    const fallback = isPage && (await cache.match(OFFLINE_PAGE));
    if (fallback) return fallback;
    throw err;
  }
}
