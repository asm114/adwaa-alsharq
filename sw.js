const CACHE='adwaa-v9.6-rc1';
const FALLBACK='./index.html';
const ASSETS=['./index.html','./manifest.json'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>response)
        .catch(()=>caches.match(FALLBACK).then(response=>response||caches.match('./')))
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response.ok&&new URL(event.request.url).origin===self.location.origin){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
