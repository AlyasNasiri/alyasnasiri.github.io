const VERSION='7494ef120c1584d2';
const CACHE='alyas-nasiri-'+VERSION;
const FILES=["./index.html","./app.mjs","./style.css","./content.mjs","./engine.mjs","./engine-client.mjs","./engine-worker.mjs","./keyboard.json","./special-letters.json","./word-lookup.mjs","./word-data.json","./vendor/find-replace.js","./vendor/text.js","./fonts/BurushaskiNaskh.woff2","./fonts/BurushaskiNastaliq.woff2","./fonts/FONT-OFL.txt","./manifest.webmanifest","./icon.svg","./404.html"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
// Activate at the next fresh visit, so an open document never changes app code mid-session.
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
