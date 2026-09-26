const APP_VERSION=new URL(self.location.href).searchParams.get("v")||"unknown";
const C="neuron-static-"+APP_VERSION;
const A=["./","./index.html","./assets/doctor_photo.svg","./opd_booking.html","./eeg_booking.html","./opd_update.html","./eeg_update.html","./statistics.html","./eeg_calls_booking.html","./eeg_calls_update_stats.html","./refund.html","./css/base.css","./js/config.js","./js/api.js","./js/utils.js","./js/idb.js","./js/common.js","./js/schedule.js","./js/opd_update.js","./js/opd_booking.js","./js/opd_patient_list.js","./js/eeg_patient_list.js","./assets/icons/home.svg","./assets/icons/opd-booking.svg","./assets/icons/opd-update.svg","./assets/icons/eeg-booking.svg","./assets/icons/eeg_calls.svg","./assets/icons/eeg-update.svg","./assets/icons/statistics.svg","./assets/neuron_logo.svg","./assets/icons/calendar.svg","./js/eeg_booking.js","./js/eeg_update.js","./js/secure.js","./js/stats.js","./js/recovery.js","./js/eeg_calls_booking.js","./js/eeg_calls_update_stats.js","./manifest.webmanifest"];
const V=u=>{const x=new URL(u,self.location.href);if(!x.searchParams.has("v"))x.searchParams.set("v",APP_VERSION);return x.href};
const R=u=>new Request(V(u),u instanceof Request?u:{method:"GET",credentials:"same-origin"});

/* Static-cache service worker + persistent NEURON Background Sync owner. */
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A.map(R))).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(a=>Promise.all(a.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 const r=R(e.request.url);
 if(u.pathname.endsWith("/js/config.js")){
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

const BG={MAX_ATTEMPTS:3,RETRY_DELAY_MS:3000,LEASE_MS:15000,HEARTBEAT_MS:5000,OPD_GATE_MS:15*60*1000,DB_VERSION:7};
let dbPromise=null;
let apiUrl=null;
let requestedCity="";

function todayKey_(ts=Date.now()){
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(ts));
 const g=t=>p.find(x=>x.type===t)?.value||"";return `${g("year")}${g("month")}${g("day")}`;
}
function metaKey_(kind,city,date){return `CACHE_SYNC_STATUS|${String(kind||"").trim()}|${String(date||"").trim()}|${String(city||"").trim()}`;}
function followMetaKey_(city){return `META|${String(city||"").trim()}`;}
function followVisitKey_(city,row){return `VISIT|${String(city||"").trim()}|${Number(row)}`;}
function postUpdate_(){self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({type:"NEURON_BACKGROUND_SYNC_UPDATED"}))).catch(()=>{});}

function openDb_(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open("NEURON_V2",BG.DB_VERSION);
  r.onupgradeneeded=e=>{
   const d=r.result;let f;
   if(!d.objectStoreNames.contains("followupCache"))f=d.createObjectStore("followupCache",{keyPath:"key"});else f=e.transaction.objectStore("followupCache");
   if(!f.indexNames.contains("cityWhatsapp"))f.createIndex("cityWhatsapp",["city","normalizedWhatsapp"],{unique:false});
   if(!f.indexNames.contains("citySourceRow"))f.createIndex("citySourceRow",["city","sourceRow"],{unique:false});
   if(!f.indexNames.contains("cityDate"))f.createIndex("cityDate",["city","date"],{unique:false});
   if(!d.objectStoreNames.contains("tx")){const st=d.createObjectStore("tx",{keyPath:"id"});st.createIndex("status","status");st.createIndex("type","type");}
   if(!d.objectStoreNames.contains("cache"))d.createObjectStore("cache",{keyPath:"key"});
   if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"});
   if(!d.objectStoreNames.contains("statisticsRetrieval")){const st=d.createObjectStore("statisticsRetrieval",{keyPath:"retrievalKey"});st.createIndex("status","status");st.createIndex("updatedAt","updatedAt");}
  };
  r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>{try{d.close()}catch(_){};dbPromise=null};resolve(d)};
  r.onerror=()=>{dbPromise=null;reject(r.error)};
 });
 return dbPromise;
}
function idbGet_(store,key){return openDb_().then(d=>new Promise((ok,no)=>{const r=d.transaction(store).objectStore(store).get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));}
function idbPut_(store,value){return openDb_().then(d=>new Promise((ok,no)=>{const t=d.transaction(store,"readwrite");t.objectStore(store).put({...value,updatedAt:Date.now()});t.oncomplete=ok;t.onerror=()=>no(t.error)}));}
function idbDelete_(store,key){return openDb_().then(d=>new Promise((ok,no)=>{const t=d.transaction(store,"readwrite");t.objectStore(store).delete(key);t.oncomplete=ok;t.onerror=()=>no(t.error)}));}
function idbReplace_(store,key,value){return openDb_().then(d=>new Promise((ok,no)=>{const t=d.transaction(store,"readwrite"),st=t.objectStore(store);st.delete(key);st.put({...value,key,updatedAt:Date.now()});t.oncomplete=ok;t.onerror=()=>no(t.error)}));}
function idbKeys_(store,index,range){return openDb_().then(d=>new Promise((ok,no)=>{const r=d.transaction(store).objectStore(store).index(index).getAllKeys(range);r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>no(r.error)}));}
function idbDeleteKeys_(store,keys){if(!keys.length)return Promise.resolve();return openDb_().then(d=>new Promise((ok,no)=>{const t=d.transaction(store,"readwrite"),st=t.objectStore(store);keys.forEach(k=>st.delete(k));t.oncomplete=ok;t.onerror=()=>no(t.error)}));}

async function getApiUrl_(){
 if(apiUrl)return apiUrl;
 const r=await fetch(V("./js/config.js"),{cache:"no-store"});
 const text=await r.text();
 const m=text.match(/apiUrl\s*:\s*["']([^"']+)["']/);
 if(!m)throw new Error("Unable to resolve NEURON API URL.");
 apiUrl=m[1];return apiUrl;
}
async function apiCall_(action,data={},timeout=25000){
 const u=await getApiUrl_();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(1000,timeout));
 try{
  const r=await fetch(u,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...data}),signal:controller.signal,cache:"no-store"});
  const text=await r.text();let j;try{j=JSON.parse(text||"{}")}catch(_){throw new Error("Server returned an invalid response.");}
  if(!r.ok||j.ok===false)throw new Error(j.error||`Server request failed (${r.status}).`);return j;
 }catch(e){if(e?.name==="AbortError")throw new Error("Network timeout.");throw e;}finally{clearTimeout(timer)}
}

async function criticalOperationState_(){
 const d=await openDb_();
 return await new Promise((ok,no)=>{
  const t=d.transaction("tx"),idx=t.objectStore("tx").index("status");
  let pending=[],uncertain=[],done=0,settled=false;
  const finish=()=>{if(++done!==2||settled)return;settled=true;const now=Date.now();const current=pending.some(x=>{const startedAt=Number(x?.startedAt)||Number(x?.updatedAt)||0;const timeoutMs=Number(x?.timeoutMs)||15000;return startedAt>0&&now<startedAt+timeoutMs;});if(current)ok("CURRENT_PENDING");else if(pending.length)ok("STALE_PENDING");else if(uncertain.length)ok("UNCERTAIN");else ok("NONE")};
  const fail=e=>{if(!settled){settled=true;no(e)}};
  const a=idx.getAll("pending"),b=idx.getAll("uncertain");
  a.onsuccess=()=>{pending=a.result||[];finish()};
  b.onsuccess=()=>{uncertain=b.result||[];finish()};
  a.onerror=()=>fail(a.error);b.onerror=()=>fail(b.error);t.onerror=()=>fail(t.error);t.onabort=()=>fail(t.error||new Error("Critical transaction lookup aborted."));
 });
}
async function waitForCriticalOperations_(){
 while((await criticalOperationState_())==="CURRENT_PENDING")await new Promise(r=>setTimeout(r,3000));
}
async function getStatus_(kind,city,date){return idbGet_("meta",metaKey_(kind,city,date));}
async function setStatus_(value){return idbPut_("meta",value);}
async function claim_(kind,city,date,mode,requestId=null){
 const c=String(city||"").trim(),d=String(date||"").trim(),k=String(kind||"").trim(),key=metaKey_(k,c,d),now=Date.now(),db=await openDb_();
 return new Promise((ok,no)=>{
  const t=db.transaction("meta","readwrite"),st=t.objectStore("meta"),r=st.get(key);let result={claimed:false,reason:"UNKNOWN"};
  r.onsuccess=()=>{
   const current=r.result||null,terminal=current&&["SUCCESS","FAILED","INCOMPLETE"].includes(current.status),running=current?.status==="RUNNING",fresh=running&&Number(current.leaseExpiresAt)>now;
   if(terminal){result={claimed:false,reason:"TERMINAL",status:current.status};return;}
   if(fresh){result={claimed:false,reason:"ACTIVE",status:current.status};return;}
   const previous=Math.max(0,Number(current?.attemptCount)||0);
   if(running&&previous>=BG.MAX_ATTEMPTS){const done={...current,status:"FAILED",completedAt:now,durationMs:Math.max(0,now-(Number(current.startedAt)||now)),leaseExpiresAt:0,lastHeartbeatAt:now,error:current.error||"Background synchronization attempt limit reached.",updatedAt:now};st.put(done);result={claimed:false,reason:"ATTEMPTS_EXHAUSTED",status:done};return;}
   const owner=`SW-${now}-${Math.random().toString(36).slice(2)}`;
   const resumeAttempt=running?Math.min(BG.MAX_ATTEMPTS,previous+1):1;
   const cycleId=running?String(current.cycleId||`${k}:${d}:${c}:${Number(current.startedAt)||now}`):`${k}:${d}:${c}:${now}`;
   const next={key,cacheType:k,city:c,date:d,status:"RUNNING",mode,requestId:requestId?String(requestId):String(current?.requestId||""),owner,cycleId,startedAt:running?Number(current.startedAt)||now:now,completedAt:null,durationMs:null,attemptCount:previous,maxAttempts:BG.MAX_ATTEMPTS,rowsProcessed:running?Number(current.rowsProcessed)||0:0,rowsAdded:running?Number(current.rowsAdded)||0:0,lastHeartbeatAt:now,leaseExpiresAt:now+BG.LEASE_MS,error:running?current.error||null:null,retryAt:running?Number(current.retryAt)||0:0,resumeAttempt,updatedAt:now};
   st.put(next);result={claimed:true,status:next};
  };
  r.onerror=()=>no(r.error);t.oncomplete=()=>ok(result);t.onerror=()=>no(t.error||new Error("Background synchronization claim failed."));t.onabort=()=>no(t.error||new Error("Background synchronization claim aborted."));
 });
}
async function heartbeat_(key,owner){
 const db=await openDb_(),now=Date.now();return new Promise((ok,no)=>{const t=db.transaction("meta","readwrite"),st=t.objectStore("meta"),r=st.get(key);let alive=false;r.onsuccess=()=>{const x=r.result;if(x?.status==="RUNNING"&&x.owner===owner){st.put({...x,lastHeartbeatAt:now,leaseExpiresAt:now+BG.LEASE_MS,updatedAt:now});alive=true;}};r.onerror=()=>no(r.error);t.oncomplete=()=>ok(alive);t.onerror=()=>no(t.error)});
}
async function updateAttempt_(key,owner,attempt,error=null){const x=await idbGet_("meta",key);if(!x||x.owner!==owner||x.status!=="RUNNING")return null;const now=Date.now();const next={...x,attemptCount:attempt,lastHeartbeatAt:now,leaseExpiresAt:now+BG.LEASE_MS,error:error?String(error):null,retryAt:error?now+BG.RETRY_DELAY_MS:0,updatedAt:now};await setStatus_(next);return next;}
async function finish_(key,owner,status,error=null,extra={}){const x=await idbGet_("meta",key);if(!x||x.owner!==owner)return null;const now=Date.now(),next={...x,status,completedAt:now,durationMs:Math.max(0,now-(Number(x.startedAt)||now)),lastHeartbeatAt:now,leaseExpiresAt:0,error:error?String(error):null,updatedAt:now,...extra};await setStatus_(next);postUpdate_();return next;}

async function claimNewOPDCycle_(city,date,mode,requestId=null){
 const c=String(city||"").trim(),d=String(date||"").trim(),now=Date.now();
 if(!c||!/^\d{8}$/.test(d))return {allowed:false,reason:"INVALID"};
 const db=await openDb_(),statusKey=metaKey_("OPD_TODAY",c,d),gateKey=`OPD_BACKGROUND_START|${d}`;
 return new Promise((ok,no)=>{
  const t=db.transaction("meta","readwrite"),st=t.objectStore("meta"),gr=st.get(gateKey),sr=st.get(statusKey);
  let gate=null,current=null,gateDone=false,statusDone=false,settled=false,result=null;
  const finish=()=>{if(settled||!gateDone||!statusDone)return;
   const running=current?.status==="RUNNING";
   if(running){result={allowed:false,reason:"RUNNING",status:current};return;}
   if(gate?.startedAt&&now-Number(gate.startedAt)<BG.OPD_GATE_MS){result={allowed:false,reason:"WINDOW_ACTIVE",status:current||null};return;}
   const cycleId=`OPD_TODAY:${d}:${c}:${now}`,next={key:statusKey,cacheType:"OPD_TODAY",city:c,date:d,status:"RUNNING",mode,requestId:requestId?String(requestId):"",owner:`SW-${now}-${Math.random().toString(36).slice(2)}`,cycleId,startedAt:now,completedAt:null,durationMs:null,attemptCount:0,maxAttempts:BG.MAX_ATTEMPTS,rowsProcessed:0,rowsAdded:0,lastHeartbeatAt:now,leaseExpiresAt:now+BG.LEASE_MS,error:null,retryAt:0,resumeAttempt:1,updatedAt:now};
   st.put({key:gateKey,type:"OPD_BACKGROUND_START",date:d,startedAt:now,cycleId,updatedAt:now});st.put(next);result={allowed:true,claim:{claimed:true,status:next}};
  };
  gr.onsuccess=()=>{gate=gr.result||null;gateDone=true;finish()};
  sr.onsuccess=()=>{current=sr.result||null;statusDone=true;finish()};
  gr.onerror=()=>{if(!settled){settled=true;no(gr.error)}};sr.onerror=()=>{if(!settled){settled=true;no(sr.error)}};
  t.oncomplete=()=>{if(settled)return;settled=true;ok(result||{allowed:false,reason:"UNKNOWN"})};
  t.onerror=()=>{if(!settled){settled=true;no(t.error||new Error("OPD background cycle initialization failed."))}};
  t.onabort=()=>{if(!settled){settled=true;no(t.error||new Error("OPD background cycle initialization aborted."))}};
 });
}

function serialGap_(records){const nums=(Array.isArray(records)?records:[]).map(x=>Number(String(x?.appointmentId||"").match(/-(\d+)$/)?.[1])).filter(Number.isInteger).sort((a,b)=>a-b);for(let i=1;i<nums.length;i++)if(nums[i]!==nums[i-1]+1)return true;return false;}
async function fullOPD_(city,date){
 const r=await apiCall_("getTodayOPDFromProperties",{city,date},25000);if(!r||r.ok!==true)throw new Error(r?.error||"Unable to retrieve today's OPD patient mirror.");
 const serverDate=/^\d{8}$/.test(String(r.date||""))?String(r.date):date,serverCity=String(r.city||city).trim()||city,patients=Array.isArray(r.patients)?r.patients:[],now=Date.now(),key=`OPD_TODAY|${serverDate}|${serverCity}`;
 const cache={key,type:"OPD_TODAY",date:serverDate,city:serverCity,patients,status:r.complete===false?"CACHED_INCOMPLETE":"REFRESHED",complete:r.complete===true,lastServerRefreshAt:now,lastServerCheckAt:now,cachedAt:now,lastSerial:Number(r.syncState?.serial)||null,lastRowNumber:Number(r.syncState?.rowNumber)||null,source:r.source||"SCRIPT_PROPERTIES"};
 if(r.serialGapDetected===true||serialGap_(patients))cache.status="STALE";
 await idbReplace_("cache",key,cache);return {mode:"PROPERTIES",city,rowsLoaded:patients.length,cache};
}
async function syncOPD_(city,date){
 return fullOPD_(city,date);
}

async function followMeta_(city){return idbGet_("followupCache",followMetaKey_(city));}
function followMetaValid_(m,c){if(!m||m.status!=="READY"||String(m.city||"").trim()!==c)return false;const known=Number(m.highestKnownSourceRow),cont=Number(m.highestContiguousSourceRow),low=Number(m.lowestSourceRow),count=Number(m.recordCount);return Number.isInteger(known)&&known>=1&&Number.isInteger(cont)&&cont>=1&&Number.isInteger(low)&&low>=1&&Number.isInteger(count)&&count>=0&&cont<=known&&low<=known;}
async function putFollowBatch_(city,records){
 if(!records.length)return {inserted:0,updated:0};
 const d=await openDb_();
 return new Promise((ok,no)=>{
  const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache");let inserted=0,updated=0,remaining=records.length,settled=false;
  const finish=()=>{if(--remaining>0)return;};
  records.forEach(x=>{
   const row=Number(x?.sourceRow);if(!Number.isInteger(row)||row<2){remaining--;return;}
   const key=followVisitKey_(city,row),r=st.get(key);
   r.onsuccess=()=>{
    if(r.result)updated++;else inserted++;
    st.put({...x,key,type:"FOLLOWUP_VISIT",city,normalizedWhatsapp:String(x.whatsapp||"").replace(/\D/g,"").slice(-10),sourceRow:row,updatedAt:Date.now()});
    finish();
   };
   r.onerror=()=>{if(!settled){settled=true;no(r.error)}};
  });
  if(!remaining){ok({inserted:0,updated:0});return;}
  t.oncomplete=()=>{if(!settled){settled=true;ok({inserted,updated})}};t.onerror=()=>{if(!settled){settled=true;no(t.error||new Error("Follow-up cache batch write failed."))}};t.onabort=()=>{if(!settled){settled=true;no(t.error||new Error("Follow-up cache batch write aborted."))}};
 });
}
async function clearFollowCity_(city){const keys=await idbKeys_("followupCache","citySourceRow",IDBKeyRange.bound([city,2],[city,Number.MAX_SAFE_INTEGER]));await idbDeleteKeys_("followupCache",keys);}
async function buildFollow_(city){
 const now=Date.now();
 await idbPut_("followupCache",{key:followMetaKey_(city),type:"FOLLOWUP_META",city,status:"BUILDING",updatedAt:now});
 try{
  const r=await apiCall_("getFollowupCityHistory",{city},100000);if(!r||r.ok!==true)throw new Error(r?.error||"Unable to build Follow-up history.");
  await clearFollowCity_(city);const records=Array.isArray(r.records)?r.records:[];for(let i=0;i<records.length;i+=500)await putFollowBatch_(city,records.slice(i,i+500));
  const count=await idbKeys_("followupCache","citySourceRow",IDBKeyRange.bound([city,2],[city,Number.MAX_SAFE_INTEGER]));if(count.length!==records.length)throw new Error("Follow-up cache build verification failed.");
  const builtAt=Date.now(),meta={city,boundaryDate:String(r.boundaryDate||""),oldestDate:records[0]?.date||"",newestDate:records[records.length-1]?.date||"",recordCount:records.length,lowestSourceRow:Number(records[0]?.sourceRow)||1,highestKnownSourceRow:Number(r.highestKnownSourceRow)||1,highestContiguousSourceRow:Number(r.highestContiguousSourceRow)||1,createdAt:builtAt,lastFullBuildAt:builtAt,lastServerCheckAt:builtAt,lastUpdatedAt:builtAt,lastServerCheckDate:todayKey_(),status:"READY",type:"FOLLOWUP_META",key:followMetaKey_(city)};await idbPut_("followupCache",meta);return {mode:"FULL_BUILD",city,rowsLoaded:records.length};
 }catch(e){await idbPut_("followupCache",{key:followMetaKey_(city),type:"FOLLOWUP_META",city,status:"BUILD_FAILED",lastUpdatedAt:Date.now()}).catch(()=>{});throw e;}
}
async function syncFollow_(city){
 const meta=await followMeta_(city);if(!followMetaValid_(meta,city))return buildFollow_(city);
 const previousContiguous=Number(meta.highestContiguousSourceRow)||1,from=Math.max(2,previousContiguous+1),r=await apiCall_("getFollowupCitySyncRange",{city,fromRow:from},100000);if(!r||r.ok!==true)throw new Error(r?.error||"Unable to synchronize Follow-up history.");
 const toRow=Number(r.toRow)||0,lastRow=Math.max(toRow,Number(r.highestKnownSourceRow)||0);
 if(lastRow<from){const next={...meta,lastUpdatedAt:Date.now(),lastServerCheckAt:Date.now(),lastServerCheckDate:todayKey_()};await idbPut_("followupCache",next);return {mode:"ALREADY_CURRENT",city,idbContiguousRow:previousContiguous,spreadsheetLastRow:lastRow,rowsScanned:0};}
 const records=Array.isArray(r.records)?r.records:[];let inserted=0,updated=0;for(let i=0;i<records.length;i+=250){const counts=await putFollowBatch_(city,records.slice(i,i+250));inserted+=counts.inserted;updated+=counts.updated;}
 const current=await followMeta_(city);if(!current||current.status!=="READY")throw new Error("Follow-up cache metadata changed during synchronization.");const next={...current,highestKnownSourceRow:Math.max(Number(current.highestKnownSourceRow)||0,lastRow),highestContiguousSourceRow:Math.max(Number(current.highestContiguousSourceRow)||0,toRow),recordCount:Math.max(0,Number(current.recordCount)||0)+inserted,lastUpdatedAt:Date.now(),lastSyncAt:Date.now(),lastServerCheckAt:Date.now(),lastServerCheckDate:todayKey_()};await idbPut_("followupCache",next);return {mode:"INCREMENTAL",city,fromRow:from,toRow,rowsReceived:records.length,rowsInserted:inserted,rowsUpdated:updated,previousContiguousRow:previousContiguous,newContiguousRow:next.highestContiguousSourceRow,spreadsheetLastRow:lastRow};
}

async function runCycle_(kind,city,date,operation,mode,preclaimed=null,requestId=null){
 let claim=preclaimed||null;
 if(!claim)claim=await claim_(kind,city,date,mode,requestId);
 if(!claim.claimed)return claim;
 try{postUpdate_()}catch(_){}
 const state=claim.status,key=state.key,owner=state.owner;let timer=null;
 try{
  timer=setInterval(()=>{void heartbeat_(key,owner).catch(()=>{})},BG.HEARTBEAT_MS);
  let attempt=Math.max(1,Math.min(BG.MAX_ATTEMPTS,Number(state.resumeAttempt)||1)),retryAt=Number(state.retryAt)||0;
  if(retryAt>Date.now())await new Promise(r=>setTimeout(r,retryAt-Date.now()));
  let lastError=null,lastResult=null;
  for(;attempt<=BG.MAX_ATTEMPTS;attempt++){
   await updateAttempt_(key,owner,attempt,null);
   try{await waitForCriticalOperations_();lastResult=await operation()}catch(e){lastResult={mode:"FAILED",error:e?.message||String(e)}}
   if(lastResult&&lastResult.mode!=="FAILED"&&lastResult.mode!=="IN_PROGRESS"&&lastResult.mode!=="SKIPPED"){
    const finished=await finish_(key,owner,"SUCCESS",null,{rowsProcessed:Number(lastResult.rowsReceived||lastResult.rowsLoaded||lastResult.rowsScanned||0),rowsAdded:Number(lastResult.rowsAdded||lastResult.rowsInserted||0)});
    return {...lastResult,backgroundStatus:finished};
   }
   lastError=lastResult?.error||`Background ${kind} synchronization attempt ${attempt} failed.`;
   if(attempt<BG.MAX_ATTEMPTS){await updateAttempt_(key,owner,attempt,lastError);await new Promise(r=>setTimeout(r,BG.RETRY_DELAY_MS));}
  }
  const finished=await finish_(key,owner,"FAILED",lastError);return {mode:"FAILED",city,error:lastError,backgroundStatus:finished};
 }catch(e){
  const originalError=String(e?.message||e),now=Date.now(),current=await getStatus_(kind,city,date).catch(()=>null);
  if(current?.owner===owner&&current.status==="RUNNING"){
   const failed={...current,status:"FAILED",completedAt:now,durationMs:Math.max(0,now-(Number(current.startedAt)||now)),lastHeartbeatAt:now,leaseExpiresAt:0,error:originalError,updatedAt:now};
   await setStatus_(failed).catch(()=>{});postUpdate_();
  }
  throw e;
 }finally{if(timer)clearInterval(timer)}
}

async function runBackgroundSync_(city,date=todayKey_(),requestId=null){
 const c=String(city||"").trim(),d=/^\d{8}$/.test(String(date))?String(date):todayKey_();if(!c)return;
 requestedCity=c;
 const existingOPD=await getStatus_("OPD_TODAY",c,d);
 const opdPromise=(async()=>{
  if(existingOPD?.status==="RUNNING")return runCycle_("OPD_TODAY",c,d,()=>syncOPD_(c,d),"INCREMENTAL",null,requestId);
  const initialized=await claimNewOPDCycle_(c,d,"INCREMENTAL",requestId);
  if(!initialized.allowed)return initialized.status||{status:"SKIPPED",reason:initialized.reason};
  return runCycle_("OPD_TODAY",c,d,()=>syncOPD_(c,d),"INCREMENTAL",initialized.claim,requestId);
 })();
 const followPromise=runCycle_("FOLLOWUP",c,d,async()=>{
  const meta=await followMeta_(c);if(followMetaValid_(meta,c)&&String(meta.lastServerCheckDate||"")===d)return {mode:"ALREADY_CHECKED",city:c};
  const result=followMetaValid_(meta,c)?await syncFollow_(c):await buildFollow_(c);if(result?.mode==="FAILED")return result;
  const verified=await followMeta_(c);if(!followMetaValid_(verified,c))throw new Error("Follow-up synchronization final validation failed.");const now=Date.now();await idbPut_("followupCache",{...verified,lastServerCheckAt:now,lastServerCheckDate:d,lastUpdatedAt:now});return result;
 },"INCREMENTAL",null,requestId);
 const results=await Promise.allSettled([opdPromise,followPromise]);postUpdate_();
 const rejected=results.find(x=>x.status==="rejected");
 if(rejected)throw rejected.reason||new Error("Background synchronization cycle could not be started.");
}

async function registerBackgroundRequest_(city,date,requestId,source){
 requestedCity=String(city||"").trim();if(!requestedCity)return;
 const normalizedDate=/^\d{8}$/.test(String(date||""))?String(date):todayKey_();
 const durableRequestId=String(requestId||`REQ-${Date.now()}-${Math.random().toString(36).slice(2)}`);
 await idbPut_("meta",{key:"BACKGROUND_SYNC_REQUEST",type:"BACKGROUND_SYNC_REQUEST",requestId:durableRequestId,city:requestedCity,date:normalizedDate,createdAt:Date.now(),updatedAt:Date.now()});
 try{source?.postMessage?.({type:"NEURON_BACKGROUND_SYNC_ACCEPTED",requestId:durableRequestId,city:requestedCity,date:normalizedDate,acceptedAt:Date.now()});}catch(_){}
 try{await self.registration.sync?.register("neuron-background-sync")}catch(_){}
 try{await self.registration.periodicSync?.register("neuron-periodic-background-sync",{minInterval:BG.OPD_GATE_MS})}catch(_){}
 try{await runBackgroundSync_(requestedCity,normalizedDate,durableRequestId)}catch(e){postUpdate_();return;}
 const latest=await idbGet_("meta","BACKGROUND_SYNC_REQUEST").catch(()=>null);
 if(latest?.requestId===durableRequestId)await idbDelete_("meta","BACKGROUND_SYNC_REQUEST").catch(()=>{});
}
async function runStoredRequest_(){
 const q=await idbGet_("meta","BACKGROUND_SYNC_REQUEST");
 if(!q)return;
 const city=String(q?.city||requestedCity||"").trim();if(!city)throw new Error("Persisted Background Sync request has no city.");
 try{await runBackgroundSync_(city,q?.date||todayKey_(),q?.requestId||null);}catch(e){postUpdate_();return;}
 const latest=await idbGet_("meta","BACKGROUND_SYNC_REQUEST").catch(()=>null);
 if(q?.requestId&&latest?.requestId===q.requestId)await idbDelete_("meta","BACKGROUND_SYNC_REQUEST").catch(()=>{});
}

self.addEventListener("message",e=>{if(e.data?.type!=="NEURON_START_BACKGROUND_SYNC")return;e.waitUntil(registerBackgroundRequest_(e.data.city,e.data.date,e.data.requestId,e.source));});
self.addEventListener("sync",e=>{if(e.tag!=="neuron-background-sync")return;e.waitUntil(runStoredRequest_());});
self.addEventListener("periodicsync",e=>{if(e.tag!=="neuron-periodic-background-sync")return;e.waitUntil(runStoredRequest_());});
