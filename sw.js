const VERSION='cbc5ecdc969817d4';
const CACHE='alyas-nasiri-'+VERSION;
const FILES=["./index.html","./app.mjs","./style.css","./content.mjs","./engine.mjs","./engine-client.mjs","./engine-worker.mjs","./keyboard.json","./special-letters.json","./word-lookup.mjs","./word-data.json","./updates.mjs","./vendor/find-replace.js","./vendor/text.js","./fonts/NasiriNaskh-Regular.woff2","./fonts/NasiriNastaliq-Book.woff2","./fonts/FONT-OFL.txt","./manifest.webmanifest","./icon.svg","./404.html"];
const LEGACY_CACHES=new Set(['alyas-nasiri-7494ef120c1584d2','alyas-nasiri-bb23f987fbdc68b5','alyas-nasiri-baf338bf972419de']);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(FILES);
  if((await caches.keys()).some(key=>LEGACY_CACHES.has(key))) await self.skipWaiting();
})()));
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
});
// Published legacy caches activate after a complete precache; later updates wait for an explicit request.
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith('alyas-nasiri-')&&key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate') {
      return (await cache.match('./index.html'))||fetch(event.request);
    }
    return (await cache.match(event.request))||fetch(event.request);
  })());
});
