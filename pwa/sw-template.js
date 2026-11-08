"use strict";
const VERSION = "__VERSION__";
const PREFIX = "glintile:" + self.registration.scope + ":";
const CACHE = PREFIX + VERSION;
const PRECACHE = __PRECACHE__;
const absolute = (p) => new URL(p, self.registration.scope).href;
const known = new Set(PRECACHE.map((p) => absolute(p.url)));
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(
        PRECACHE.map(
          (p) =>
            new Request(absolute(p.url), {
              cache: "reload",
              integrity: p.integrity,
            }),
        ),
      ),
    ),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(PREFIX) && n !== CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  if (
    req.mode === "navigate" &&
    (url.pathname === new URL(self.registration.scope).pathname ||
      url.pathname === new URL("index.html", self.registration.scope).pathname)
  ) {
    event.respondWith(
      (async () => {
        // Hosts such as Cloudflare Pages redirect index.html to the scope root.
        // A redirected Response cannot satisfy a navigation request in manual mode.
        const cached = await caches.match(absolute("./"), {
          cacheName: CACHE,
        });
        if (cached) return cached;
        try {
          const response = await fetch(req);
          if (response.ok) return response;
        } catch {}
        return Response.error();
      })(),
    );
    return;
  }
  if (!known.has(url.href)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then(async (cache) => (await cache.match(req)) || fetch(req)),
  );
});
