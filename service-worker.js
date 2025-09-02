const CACHE_NAME = "ttt-v3";
const ASSETS = ["./","./index.html","./styles.css","./script.js","./manifest.json","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install", e=>{ e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE_NAME?null:caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e=>{
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if (cached) return cached;
      return fetch(e.request).then(res=>{
        if (e.request.method==="GET"){
          try{ const url=new URL(e.request.url); if (url.origin===location.origin){ const copy=res.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request,copy)); } }catch{}
        }
        return res;
      }).catch(()=> e.request.mode==="navigate" ? caches.match("./index.html") : undefined)
    })
  );
});
