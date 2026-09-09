const APP_VERSION=new URL(self.location.href).searchParams.get("v")||"unknown";
const C="neuron-static-"+APP_VERSION;
const A=["./","./index.html","./assets/doctor_photo.svg","./opd_booking.html","./eeg_booking.html","./opd_update.html","./eeg_update.html","./statistics.html","./eeg_calls_booking.html","./eeg_calls_update_stats.html","./css/base.css","./js/config.js","./js/api.js","./js/utils.js","./js/idb.js","./js/common.js","./js/schedule.js","./js/opd_update.js","./js/opd_booking.js","./assets/icons/home.svg","./assets/icons/opd-booking.svg","./assets/icons/opd-update.svg","./assets/icons/eeg-booking.svg","./assets/icons/eeg_calls.svg","./assets/icons/eeg-update.svg","./assets/icons/statistics.svg","./assets/neuron_logo.svg","./assets/icons/calendar.svg","./js/eeg_booking.js","./js/eeg_update.js","./js/secure.js","./js/stats.js","./js/recovery.js","./js/eeg_calls_booking.js","./js/eeg_calls_update_stats.js","./manifest.webmanifest"];
const V=u=>{const x=new URL(u,self.location.origin);if(!x.searchParams.has("v"))x.searchParams.set("v",APP_VERSION);return x.href};
const R=u=>new Request(V(u),u instanceof Request?u:{method:"GET",credentials:"same-origin"});
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A.map(R))).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(a=>Promise.all(a.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 const r=R(e.request.url);
 if(new URL(e.request.url).pathname.endsWith("/js/config.js")){
   e.respondWith(fetch(r,{cache:"no-store"}).then(x=>{const q=x.clone();caches.open(C).then(c=>c.put(r,q));return x}).catch(()=>caches.match(r)));return;
 }
 if(e.request.mode==="navigate"){
   e.respondWith(fetch(r).then(x=>{const q=x.clone();caches.open(C).then(c=>c.put(r,q));return x})
   .catch(()=>caches.match(R("./index.html")).then(x=>x||caches.match(R("./")))));return;
 }
 e.respondWith(caches.match(r).then(cached=>{
   const fresh=fetch(r).then(x=>{const q=x.clone();caches.open(C).then(c=>c.put(r,q));return x}).catch(()=>cached);
   return cached||fresh;
 }));
});
