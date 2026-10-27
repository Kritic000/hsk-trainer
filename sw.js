// Service worker for «Прописи HSK».
// shell — page, library, fonts, icons: precached on install.
// data  — data/strokes-*.json, audio-*.json (~21 MB): cached as levels are opened
//         or all at once via the «Скачать всё для офлайна» button.
// sent  — data/sentences-*.json (~1 MB): same, but in its own cache, so updating the example
//         sentences doesn't throw away 21 MB of strokes and audio.
// speech — data/speech-*.json (dialogues and key phrases of the «Речь» section): its own cache too.
// After changing index.html/lib/fonts, bump SHELL_VERSION so clients pick up new files.
// DATA_VERSION — when strokes/audio change; SENT_VERSION — when sentences change;
// SPEECH_VERSION — when speech files change
// voice — data/voice-*.json and voice-*.mp3 (phrases read by a neural voice, made by tools/voice.py): its own cache.
// VOICE_VERSION — when voice files change
// data/hints-*.json and data/tones-*.json (small) belong to the shell: SHELL_VERSION when they change
// (each together with the same number in DATA_CACHE / SENT_CACHE / SPEECH_CACHE / VOICE_CACHE in index.html).
const SHELL_VERSION = 36;
const DATA_VERSION = 2;
const SENT_VERSION = 3;
const SPEECH_VERSION = 3;
const VOICE_VERSION = 3;
const SHELL = `propisi-shell-v${SHELL_VERSION}`;
const DATA = `propisi-data-v${DATA_VERSION}`;
const SENT = `propisi-sent-v${SENT_VERSION}`;
const SPEECH = `propisi-speech-v${SPEECH_VERSION}`;
const VOICE = `propisi-voice-v${VOICE_VERSION}`;
// the engine and the model of the strict check (≈75 MB), downloaded by lib/sherpa/asr-worker.js: never deleted here
const ASR = "propisi-asr-v1";
const isSentences = path => /\/data\/sentences-[^/]+\.json$/.test(path);
const isSpeech = path => /\/data\/speech-[^/]+\.json$/.test(path);
const isVoice = path => /\/data\/voice-[^/]+\.(json|mp3)$/.test(path);
const isShellData = path => /\/data\/(hints|tones)-[^/]+\.json$/.test(path);

const SHELL_FILES = [
  "./",
  "index.html",
  "manifest.json",
  "data/hints-1.json",
  "data/tones-1.json",
  "lib/hanzi-writer.min.js",
  "lib/pinyin-pro.min.js",
  "lib/sherpa/asr-worker.js",
  "lib/sherpa/sherpa-onnx-asr.js",
  "lib/sherpa/sherpa-onnx-wasm-main-vad-asr.js",
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
  "fonts/noto-serif-sc-08.woff2",
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
    .then(keys => Promise.all(keys.filter(k => k.startsWith("propisi-") && ![SHELL, DATA, SENT, SPEECH, VOICE, ASR].includes(k)).map(k => caches.delete(k))))
    // sentences used to live in the data cache: drop those old copies
    .then(() => caches.open(DATA)).then(c => c.keys().then(reqs => Promise.all(reqs.filter(r => isSentences(new URL(r.url).pathname)).map(r => c.delete(r)))))
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
  // the recognition test page lives on its own: its own service worker, nothing of it in our caches
  if (url.pathname.includes("/asr-test/")) return;
  if (req.mode === "navigate") return e.respondWith(page(req));
  const isData = /\/data\/[^/]+\.json$/.test(url.pathname) && !isShellData(url.pathname);
  e.respondWith(cacheFirst(req, isVoice(url.pathname) ? VOICE : isSentences(url.pathname) ? SENT : isSpeech(url.pathname) ? SPEECH : isData ? DATA : SHELL));
});
