const CACHE='adwaa-v9.7-security-hardening-1';
const FALLBACK='./index.html';
const ASSETS=['./index.html','./cleaner.html','./security-validation.js','./manifest.json'];
const CACHEABLE_PATHS=new Set(ASSETS.map(path=>new URL(path,self.location.href).pathname));

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
    fetch(event.request,{cache:'no-store'})
      .then(response=>{
        const requestUrl=new URL(event.request.url);
        if(response.ok&&requestUrl.origin===self.location.origin&&CACHEABLE_PATHS.has(requestUrl.pathname)){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>{
        const requestUrl=new URL(event.request.url);
        return requestUrl.origin===self.location.origin&&CACHEABLE_PATHS.has(requestUrl.pathname)
          ?caches.match(event.request)
          :Response.error()
      })
  );
});
