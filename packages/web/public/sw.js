/* The Vite build fills these placeholders from every shipped file.
 * A shell is available offline only after its entire revision installs. */
const CACHE = "openmahjong-__OM_CACHE_REVISION__";
const PRECACHE = /*__OM_PRECACHE__*/ ["./", "./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(PRECACHE))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("openmahjong-") && key !== CACHE)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    if (event.request.mode === "navigate") {
      const privacy = new URL("./privacy", self.registration.scope);
      if (url.pathname === privacy.pathname || url.pathname === `${privacy.pathname}/`) {
        const policy = await cache.match(new URL("./privacy/index.html", self.registration.scope).href);
        if (policy) return policy;
      }
    }
    try {
      // Cache only known build assets. Arbitrary URLs must not fill
      // browser storage or replace the versioned offline shell.
      return await fetch(event.request);
    } catch {
      if (event.request.mode === "navigate") {
        const shell = await cache.match(new URL("./index.html", self.registration.scope).href);
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
