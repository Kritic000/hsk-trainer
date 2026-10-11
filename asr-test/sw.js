// Service worker of the recognition test page only (scope: /asr-test/). It keeps the page, its scripts and the
// libraries from the CDN for offline use. Models are cached by the page itself (Cache Storage), not here.
const CACHE = "asr-test-shell-v1";
const KEEP = ["cdn.jsdelivr.net"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("asr-test-shell-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !KEEP.includes(url.hostname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // the page itself: fresh when there is a network
    if (req.mode === "navigate") {
      try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
      catch (err) { return (await cache.match(req, { ignoreSearch: true })) || Response.error(); }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
