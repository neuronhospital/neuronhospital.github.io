const C="neuron-static-v14";
const A=["./","./index.html","./opd_booking.html","./eeg_booking.html","./opd_update.html","./eeg_update.html","./statistics.html","./css/base.css","./js/config.js","./js/api.js","./js/utils.js","./js/idb.js","./js/common.js","./js/schedule.js","./js/opd.js","./js/opd_booking.js","./assets/icons/home.svg","./assets/icons/opd-booking.svg","./assets/icons/opd-update.svg","./assets/icons/eeg-booking.svg","./assets/icons/eeg-update.svg","./assets/icons/statistics.svg","./js/eeg.js","./js/secure.js","./js/update.js","./js/stats.js","./js/recovery.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(a=>Promise.all(a.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const u=new URL(e.request.url); if(u.origin!==location.origin)return;
 if(e.request.mode==="navigate"){
   e.respondWith(fetch(e.request).then(r=>{const q=r.clone();caches.open(C).then(c=>c.put(e.request,q));return r})
   .catch(()=>caches.match(e.request).then(x=>x||caches.match("./index.html")))); return;
 }
 e.respondWith(caches.match(e.request).then(cached=>{
   const fresh=fetch(e.request).then(r=>{const q=r.clone();caches.open(C).then(c=>c.put(e.request,q));return r}).catch(()=>cached);
   return cached||fresh;
 }));
});