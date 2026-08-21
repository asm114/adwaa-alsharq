// Keep this app's cache isolated from other projects sharing the same GitHub Pages origin.
const SCOPE_PATH=new URL(self.registration.scope).pathname.replace(/\/+$/,'')||'/';
const CACHE_NAMESPACE=`adwaa-alsharq:${SCOPE_PATH}:`;
const CACHE=`${CACHE_NAMESPACE}app-state-20260821`;
const FALLBACK='./index.html';
const ASSETS=['./index.html','./manifest.json','./supabase-config.staging.js'];

function isAppShellRequest(request){
  const requestUrl=new URL(request.url);
  const scopeUrl=new URL(self.registration.scope);
  const fallbackUrl=new URL(FALLBACK,self.registration.scope);
  return requestUrl.origin===scopeUrl.origin&&(requestUrl.pathname===scopeUrl.pathname||requestUrl.pathname===fallbackUrl.pathname);
}

function currentCacheMatch(request){
  return caches.open(CACHE).then(cache=>cache.match(request));
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_NAMESPACE)&&key!==CACHE).map(key=>caches.delete(key))))
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
        .catch(()=>currentCacheMatch(event.request).then(response=>response||currentCacheMatch(FALLBACK)))
    );
    return;
  }
  const sameOrigin=new URL(event.request.url).origin===self.location.origin;
  event.respondWith(
    fetch(event.request,sameOrigin?{cache:'no-store'}:{})
      .then(response=>{
        if(response.ok&&sameOrigin){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      })
      .catch(()=>currentCacheMatch(event.request))
  );
});
