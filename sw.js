// Service worker for «Прописи HSK».
// shell — page, library, fonts, icons: precached on install.
// data  — data/*.json (strokes + audio, ~21 MB): cached as levels are opened
//         or all at once via the «Скачать всё для офлайна» button.
// After changing index.html/lib/fonts, bump SHELL_VERSION so clients pick up new files.
// DATA_VERSION only needs a bump when data/*.json change.
const SHELL_VERSION = 1;
const DATA_VERSION = 1;
const SHELL = `propisi-shell-v${SHELL_VERSION}`;
const DATA = `propisi-data-v${DATA_VERSION}`;

const SHELL_FILES = [
  "./",
  "index.html",
  "manifest.json",
  "lib/hanzi-writer.min.js",
  "fonts/fonts.css",
  "fonts/golos-cyrillic-ext.woff2",
  "fonts/golos-cyrillic.woff2",
  "fonts/golos-latin-ext.woff2",
  "fonts/golos-latin.woff2",
  "fonts/noto-serif-sc-00.woff2",
  "fonts/noto-serif-sc-01.woff2",
  "fonts/noto-serif-sc-02.woff2",
  "fonts/noto-serif-sc-03.woff2",
  "fonts/noto-serif-sc-04.woff2",
  "fonts/noto-serif-sc-05.woff2",
  "fonts/noto-serif-sc-06.woff2",
  "fonts/noto-serif-sc-07.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("propisi-") && k !== SHELL && k !== DATA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Page: network first (so updates arrive), cache if offline or the network hangs.
async function page(req){
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    if (res.ok) cache.put("index.html", res.clone());
    return res;
  } catch (err) {
    return (await cache.match("index.html")) || (await cache.match("./")) || Response.error();
  }
}

// Everything else of ours: cache first, fill the cache on miss.
async function cacheFirst(req, name){
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") return e.respondWith(page(req));
  const isData = /\/data\/[^/]+\.json$/.test(url.pathname);
  e.respondWith(cacheFirst(req, isData ? DATA : SHELL));
});
