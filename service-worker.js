const CACHE_NAME = "ttt-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k)))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        const copy = resp.clone();
        if (req.method === "GET") {
          try {
            const url = new URL(req.url);
            if (url.origin === location.origin) {
              caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
            }
          } catch {}
        }
        return resp;
      }).catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
      })
    })
  );
});
