// Refresh environment routing assets without changing the established cache contract.
const CACHE='adwaa-staging-app-state-20260818';
const FALLBACK='./index.html';
const ASSETS=['./index.html','./manifest.json','./supabase-config.staging.js'];

function isAppShellRequest(request){
  const requestUrl=new URL(request.url);
  const scopeUrl=new URL(self.registration.scope);
  const fallbackUrl=new URL(FALLBACK,self.registration.scope);
  return requestUrl.origin===scopeUrl.origin&&(requestUrl.pathname===scopeUrl.pathname||requestUrl.pathname===fallbackUrl.pathname);
}

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
        .then(async response=>{
          if(response.ok&&isAppShellRequest(event.request)){
            const cache=await caches.open(CACHE);
            await cache.put(FALLBACK,response.clone());
          }
          return response;
        })
        .catch(()=>caches.match(event.request).then(response=>response||caches.match(FALLBACK)))
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
