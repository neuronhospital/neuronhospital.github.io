window.IDB={
 db:null,
 _dbGeneration:0,
 _backgroundSyncAckWaiters:Object.create(null),
 _backgroundSyncMessageBound:false,
 CACHE_FRESHNESS_MS:30*60*1000,
 OPD_BACKGROUND_SYNC_INTERVAL_MS:15*60*1000,
 MANUAL_FOLLOWUP_REBUILD_LEASE_MS:20000,
 MANUAL_FOLLOWUP_REBUILD_HEARTBEAT_MS:5000,
 _isConnectionLifecycleError_(e){
  const name=String(e?.name||"").toLowerCase();
  const msg=String(e?.message||e||"").toLowerCase();
  return name==="invalidstateerror"&&/(closing|closed|close|connection|database)/.test(msg) || /(database|connection).*(closing|closed|close)/.test(msg);
 },
 _invalidateDb_(connection){
  const current=this.db;
  this.db=null;
  this._dbGeneration++;
  try{if(connection&&connection.close)connection.close();}catch(_){}
  return current;
 },
 async withConnectionRetry_(work){
  let generation=this._dbGeneration;
  let d=await this.open();
  try{return await work(d);}
  catch(e){
   if(!this._isConnectionLifecycleError_(e))throw e;
   if(this._dbGeneration===generation)this._invalidateDb_(d);
   generation=this._dbGeneration;
   d=await this.open();
   return await work(d);
  }
 },
 serialGap_(records,field="appointmentId"){
  const serials=(Array.isArray(records)?records:[]).map(x=>{const m=String(x?.[field]||"").match(/-(\d+)$/);return m?Number(m[1]):null}).filter(n=>Number.isInteger(n)&&n>=0);
  if(serials.length<2)return false;
  const unique=[...new Set(serials)].sort((a,b)=>a-b);
  for(let i=1;i<unique.length;i++)if(unique[i]!==unique[i-1]+1)return true;
  return false;
 },
 cacheStale_(cache,records,field="appointmentId"){
  if(!cache)return false;
  if(this.serialGap_(records,field))return true;
  const ts=Number(cache.lastServerCheckAt||cache.lastServerRefreshAt||cache.lastCheckedAt||0);
  return !!ts&&(Date.now()-ts>this.CACHE_FRESHNESS_MS);
 },
 opdTodayCacheStale_(cache,records,field="appointmentId"){
  if(!cache)return false;
  return this.serialGap_(records,field);
 },
 markCacheStale_(cache,records,field="appointmentId"){
  if(!cache)return cache;
  if(this.cacheStale_(cache,records,field))return {...cache,status:"STALE"};
  return cache;
 },
 open(){
  if(this.db)return this.db;
  const generation=++this._dbGeneration;
  const promise=new Promise((ok,no)=>{
   const r=indexedDB.open("NEURON_V2",7);
   r.onupgradeneeded=e=>{const d=r.result;let fst;if(!d.objectStoreNames.contains("followupCache")){fst=d.createObjectStore("followupCache",{keyPath:"key"});}else{fst=e.transaction.objectStore("followupCache");}if(fst&&!fst.indexNames.contains("cityWhatsapp"))fst.createIndex("cityWhatsapp",["city","normalizedWhatsapp"],{unique:false});if(fst&&!fst.indexNames.contains("citySourceRow"))fst.createIndex("citySourceRow",["city","sourceRow"],{unique:false});if(fst&&!fst.indexNames.contains("cityDate"))fst.createIndex("cityDate",["city","date"],{unique:false});if(!d.objectStoreNames.contains("tx")){const st=d.createObjectStore("tx",{keyPath:"id"});st.createIndex("status","status");st.createIndex("type","type")}if(!d.objectStoreNames.contains("cache"))d.createObjectStore("cache",{keyPath:"key"});if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"});if(!d.objectStoreNames.contains("statisticsRetrieval")){const st=d.createObjectStore("statisticsRetrieval",{keyPath:"retrievalKey"});st.createIndex("status","status");st.createIndex("updatedAt","updatedAt")}};
   r.onsuccess=()=>{
    const d=r.result;
    const invalidate=()=>{if(this.db===promise)this.db=null;this._dbGeneration++;};
    d.onclose=invalidate;
    d.onversionchange=()=>{try{d.close();}catch(_){}invalidate();};
    ok(d);
   };
   r.onerror=()=>no(r.error);
  });
  this.db=promise;
  promise.catch(()=>{if(this.db===promise)this.db=null;});
  if(generation!==this._dbGeneration&&this.db===promise)this.db=null;
  return promise;
 },
 put(s,v){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction(s,"readwrite");t.objectStore(s).put({...v,updatedAt:Date.now()});t.oncomplete=ok;t.onerror=()=>no(t.error)}))},
 get(s,k){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const r=d.transaction(s).objectStore(s).get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}))},
 delete(s,k){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction(s,"readwrite");t.objectStore(s).delete(k);t.oncomplete=ok;t.onerror=()=>no(t.error)}))},
 replace(s,k,v){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{let settled=false;const done=fn=>x=>{if(settled)return;settled=true;fn(x)};const t=d.transaction(s,"readwrite"),st=t.objectStore(s);t.oncomplete=done(ok);t.onerror=done(()=>no(t.error||new Error("IndexedDB replacement failed.")));t.onabort=done(()=>no(t.error||new Error("IndexedDB replacement aborted.")));st.delete(k);st.put({...v,key:k,updatedAt:Date.now()});}))},
 all(s){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const r=d.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}))},
 pending(){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction("tx"),idx=t.objectStore("tx").index("status");let pending=[],uncertain=[],done=0,settled=false;const finish=()=>{if(++done!==2||settled)return;settled=true;ok([...pending,...uncertain])};const fail=e=>{if(settled)return;settled=true;no(e)};const rp=idx.getAll("pending"),ru=idx.getAll("uncertain");rp.onsuccess=()=>{pending=rp.result||[];finish()};ru.onsuccess=()=>{uncertain=ru.result||[];finish()};rp.onerror=()=>fail(rp.error);ru.onerror=()=>fail(ru.error);t.onerror=()=>fail(t.error);t.onabort=()=>fail(t.error||new Error("Pending transaction lookup aborted."));}))},
  promotePendingToUncertain(id,now=Date.now()){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction("tx","readwrite"),st=t.objectStore("tx");let result=null,settled=false;const r=st.get(id);r.onsuccess=()=>{const x=r.result;if(!x){result=null;return}if(x.status!=="pending"){result=x;return}result={...x,status:"uncertain",uncertainAt:now};st.put({...result,updatedAt:Date.now()})};r.onerror=()=>{if(!settled){settled=true;no(r.error)}};t.oncomplete=()=>{if(!settled){settled=true;ok(result)}};t.onerror=()=>{if(!settled){settled=true;no(t.error||new Error("Pending transaction promotion failed."))}};t.onabort=()=>{if(!settled){settled=true;no(t.error||new Error("Pending transaction promotion aborted."))}};}))},
 deleteCacheByPrefixExcept(s,prefix,keepPrefix){return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction(s,"readwrite"),st=t.objectStore(s),r=st.openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;const k=String(c.key||"");if(k.startsWith(prefix)&&(!keepPrefix||!k.startsWith(keepPrefix)))c.delete();c.continue()};r.onerror=()=>no(r.error);t.oncomplete=ok;t.onerror=()=>no(t.error)}))},
 todayKey_(){
  const p=window.U?.parts?.()||(()=>{const d=new Date();return {y:d.getFullYear(),m:d.getMonth()+1,d:d.getDate()};})();
  return `${p.y}${String(p.m).padStart(2,"0")}${String(p.d).padStart(2,"0")}`;
 },
 normalizeWhatsApp_(v){
  const raw=String(v==null?"":v).replace(/\D/g,"");
  return raw.length>10?raw.slice(-10):raw;
 },
 findTodayPatientsByWhatsApp_({city,whatsapp,date}={}){
  const c=String(city||"").trim();
  const d=/^\d{8}$/.test(String(date||""))?String(date):this.todayKey_();
  const phone=this.normalizeWhatsApp_(whatsapp);
  const key=`OPD_TODAY|${d}|${c}`;
  if(!c||!phone)return Promise.resolve({cache:null,patients:[]});
  return this.get("cache",key).then(cache=>{
   const patients=Array.isArray(cache?.patients)?cache.patients.filter(p=>
    String(p?.city||c).trim()===c && this.normalizeWhatsApp_(p?.whatsapp)===phone
   ):[];
   return {cache:cache||null,patients,todayAppointmentFound:Array.isArray(cache?.patients)&&cache.patients.some(p=>String(p?.city||c).trim()===c)};
  });
 },
 _legacyEEGCacheCleaned:false,
 _todayOPDCacheCleanupDate:"",
 _todayOPDRefreshes:{},
 _backgroundTimersStarted:false,
 _backgroundServiceWorkerMessageBound:false,
 async cleanupLegacyEEGCache_(){
  if(this._legacyEEGCacheCleaned)return;
  this._legacyEEGCacheCleaned=true;
  try{await this.deleteCacheByPrefixExcept("cache","EEG_TODAY|","__none__");}catch(_){ }
 },
 async cleanupOldTodayOPDCaches_(today){
  if(this._todayOPDCacheCleanupDate===today)return;
  try{
   const t=String(today||this.todayKey_());
   if(!/^\d{8}$/.test(t))return;
   const base=new Date(Date.UTC(Number(t.slice(0,4)),Number(t.slice(4,6))-1,Number(t.slice(6,8))));
   const keep=new Set();
   for(let i=0;i<3;i++){const d=new Date(base);d.setUTCDate(d.getUTCDate()-i);keep.add(`OPD_TODAY|${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}|`);}
   await this.withConnectionRetry_(db=>new Promise((ok,no)=>{const tx=db.transaction("cache","readwrite"),st=tx.objectStore("cache"),r=st.openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;const k=String(c.key||"");if(k.startsWith("OPD_TODAY|")&&!Array.from(keep).some(prefix=>k.startsWith(prefix)))c.delete();c.continue();};r.onerror=()=>no(r.error);tx.oncomplete=ok;tx.onerror=()=>no(tx.error);}));
   this._todayOPDCacheCleanupDate=t;
  }catch(_){ }
 },
 async getOPDTodayCache_(city,date){
  const c=String(city||"").trim(),d=/^\d{8}$/.test(String(date||""))?String(date):this.todayKey_();
  if(!c)return null;
  // Statistics cache lookup must be an exact O(1)-style IDB key read.
  // Retention cleanup is maintained by the normal OPD_TODAY synchronization
  // path and must never block Statistics retrieval.
  return this.get("cache",`OPD_TODAY|${d}|${c}`).catch(()=>null);
 },
 followupCheckedToday_(meta){
  if(!meta||meta.status!=="READY")return false;
  const today=this.todayKey_();
  const explicit=String(meta.lastServerCheckDate||"");
  if(/^\d{8}$/.test(explicit))return explicit===today;
  const ts=Number(meta.lastServerCheckAt)||0;
  if(!ts)return false;
  const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date(ts));
  const g=x=>p.find(a=>a.type===x)?.value||"";
  return `${g("year")}${g("month")}${g("day")}`===today;
 },
 backgroundSyncStatusKey_(kind,city,date){
  return `CACHE_SYNC_STATUS|${String(kind||"").trim()}|${String(date||"").trim()}|${String(city||"").trim()}`;
 },
 backgroundSyncBarStateKey_(){
  return "neuron_background_sync_bar_state";
 },
 getBackgroundSyncBarState_(){
  try{const raw=localStorage.getItem(this.backgroundSyncBarStateKey_());return raw?JSON.parse(raw):null;}catch(_){return null;}
 },
 setBackgroundSyncBarState_(state){
  try{localStorage.setItem(this.backgroundSyncBarStateKey_(),JSON.stringify(state||{}));return true;}catch(_){return false;}
 },
 backgroundSyncBarRunning_(cycleId){
  if(!cycleId)return;
  const current=this.getBackgroundSyncBarState_();
  if(current?.cycleId===cycleId&&current.status==="RUNNING"&&Number(current.dismissAt)===0)return;
  this.setBackgroundSyncBarState_({cycleId,status:"RUNNING",dismissAt:0,updatedAt:Date.now()});
 },
 backgroundSyncBarTerminal_(cycleId){
  if(!cycleId)return;
  const current=this.getBackgroundSyncBarState_();
  if(current?.cycleId===cycleId&&current.status==="TERMINAL"&&Number(current.dismissAt)>Date.now())return;
  this.setBackgroundSyncBarState_({cycleId,status:"TERMINAL",dismissAt:Date.now()+5000,updatedAt:Date.now()});
 },
 backgroundSyncBarDismiss_(cycleId){
  if(!cycleId)return;
  const current=this.getBackgroundSyncBarState_();
  if(current?.cycleId===cycleId)this.setBackgroundSyncBarState_({...current,status:"DISMISSED",dismissAt:0,updatedAt:Date.now()});
 },
 async getBackgroundSyncStatus_(kind,city,date){
  return this.get("meta",this.backgroundSyncStatusKey_(kind,city,date));
 },
 ensureBackgroundSyncBar_(){
  if(!document.body)return null;
  let bar=document.getElementById("neuronBackgroundSyncBar");
  if(!bar){bar=document.createElement("div");bar.id="neuronBackgroundSyncBar";bar.className="neuron-background-sync-bar";bar.hidden=true;document.body.insertBefore(bar,document.body.firstChild);}
  return bar;
 },
 async reconcileBackgroundSyncBarState_(){
  const city=window.TodayCity?.resolve?.()||window.Schedule?.cityAtNow?.(window.NEURON_CONFIG?.cities||[])||"",date=this.todayKey_();
  if(!city)return {city:"",date,opd:null,follow:null};
  const [opd,follow]=await Promise.all([this.getBackgroundSyncStatus_("OPD_TODAY",city,date).catch(()=>null),this.getBackgroundSyncStatus_("FOLLOWUP",city,date).catch(()=>null)]);
  const terminal=x=>x&&["SUCCESS","FAILED","INCOMPLETE"].includes(x.status),active=x=>x?.status==="RUNNING";
  const candidates=[opd,follow].filter(x=>x?.cycleId).sort((a,b)=>(Number(b?.startedAt)||0)-(Number(a?.startedAt)||0));
  const cycleId=candidates[0]?.cycleId||null;
  if(cycleId&&(active(opd)||active(follow))){this.backgroundSyncBarRunning_(cycleId);}
  else if(cycleId&&!active(opd)&&!active(follow)&&(terminal(opd)||terminal(follow))){
   const ui=this.getBackgroundSyncBarState_();
   if(ui?.cycleId===cycleId&&ui.status==="TERMINAL"){
    if(Number(ui.dismissAt)<=Date.now())this.backgroundSyncBarDismiss_(cycleId);
   }else if(ui?.cycleId!==cycleId||ui?.status!=="DISMISSED"){
    this.backgroundSyncBarTerminal_(cycleId);
   }
  }
  return {city,date,opd,follow,cycleId};
 },
 async shouldRequestBackgroundSync_(city,date){
  const c=String(city||"").trim(),d=/^\d{8}$/.test(String(date||""))?String(date):this.todayKey_();
  if(!c)return false;
  const [opd,follow,gate,followMeta]=await Promise.all([
   this.getBackgroundSyncStatus_("OPD_TODAY",c,d),
   this.getBackgroundSyncStatus_("FOLLOWUP",c,d),
   this.get("meta",`OPD_BACKGROUND_START|${d}`),
   this.get("followupCache",`META|${c}`)
  ]);
  if(opd?.status==="RUNNING"||follow?.status==="RUNNING")return true;
  const opdDue=!gate?.startedAt||(Date.now()-Number(gate.startedAt)>=this.OPD_BACKGROUND_SYNC_INTERVAL_MS);
  const followDue=!followMeta||followMeta.status!=="READY"||String(followMeta.lastServerCheckDate||"")!==d;
  if(opdDue)return true;
  if(follow?.status==="RUNNING")return true;
  if(follow&&["FAILED","INCOMPLETE"].includes(follow.status))return false;
  if(followDue)return true;
  return false;
 },
 async renderBackgroundSyncBar_(){
  const bar=this.ensureBackgroundSyncBar_();if(!bar)return;
  const state=await this.reconcileBackgroundSyncBarState_();
  const {opd,follow,cycleId}=state;if(!cycleId){
   const ui=this.getBackgroundSyncBarState_();
   if(!(ui?.status==="TERMINAL"&&Number(ui.dismissAt)>Date.now())){bar.hidden=true;bar.dataset.hideAt="";}
   return;
  }
  const terminal=x=>x&&["SUCCESS","FAILED","INCOMPLETE"].includes(x.status),active=x=>x?.status==="RUNNING";
  let ui=this.getBackgroundSyncBarState_();
  if(ui?.cycleId===cycleId&&ui.status==="DISMISSED"){bar.hidden=true;bar.dataset.hideAt="";return;}
  const fmt=x=>{if(!x)return "";const icon=x.status==="SUCCESS"?"✅":x.status==="RUNNING"?"⟳":"⚠";const name=x.cacheType==="FOLLOWUP"?"Follow-up":"OPD";const sec=Number.isFinite(Number(x.durationMs))&&Number(x.durationMs)>0?` (${Math.round(Number(x.durationMs)/1000)} Sec)`:"";return `${icon} ${name}${sec}`;};
  bar.className=`neuron-background-sync-bar ${active(opd)||active(follow)?"is-running":"is-terminal"}`;
  bar.innerHTML=`<span>${fmt(opd)}${opd&&follow?" • ":""}${fmt(follow)}</span>`;
  bar.hidden=false;
  ui=this.getBackgroundSyncBarState_();
  if(ui?.cycleId===cycleId&&ui.status==="TERMINAL"){
   const dismissAt=Number(ui.dismissAt)||0,remaining=dismissAt-Date.now();
   if(remaining<=0){this.backgroundSyncBarDismiss_(cycleId);bar.hidden=true;bar.dataset.hideAt="";return;}
   const hideAt=dismissAt;bar.dataset.hideAt=String(hideAt);
   setTimeout(()=>{if(Number(bar.dataset.hideAt)===hideAt){this.backgroundSyncBarDismiss_(cycleId);bar.hidden=true;bar.dataset.hideAt="";}},remaining);
  }else bar.dataset.hideAt="";
 },
 bindBackgroundServiceWorkerMessages_(){
  if(this._backgroundSyncMessageBound||!navigator.serviceWorker)return;
  this._backgroundSyncMessageBound=true;
  navigator.serviceWorker.addEventListener("message",e=>{
   const data=e.data||{};
   if(data.type==="NEURON_BACKGROUND_SYNC_ACCEPTED"&&data.requestId){
    const waiter=this._backgroundSyncAckWaiters[data.requestId];
    if(waiter){delete this._backgroundSyncAckWaiters[data.requestId];clearTimeout(waiter.timer);waiter.resolve(data);}
    return;
   }
   if(data.type==="NEURON_BACKGROUND_SYNC_UPDATED")void this.renderBackgroundSyncBar_();
  });
 },
 async requestBackgroundSyncToServiceWorker_(city){
  const c=String(city||"").trim(),date=this.todayKey_();
  if(!c||!navigator.serviceWorker)return {sent:false,accepted:false};
  const requestId=`REQ-${Date.now()}-${Math.random().toString(36).slice(2)}`,requestSentAt=Date.now();
  this.bindBackgroundServiceWorkerMessages_();
  try{
   const reg=await navigator.serviceWorker.ready;
   const target=navigator.serviceWorker.controller||reg.active||reg.waiting||reg.installing;
   if(!target)return {sent:false,accepted:false,requestId};
   const ack=new Promise(resolve=>{
    const timer=setTimeout(()=>{delete this._backgroundSyncAckWaiters[requestId];resolve(null)},3000);
    this._backgroundSyncAckWaiters[requestId]={resolve,timer};
   });
   target.postMessage({type:"NEURON_START_BACKGROUND_SYNC",requestId,city:c,date});
   const accepted=await ack;
   if(accepted)return {sent:true,accepted:true,requestId};
   const durable=await this.get("meta","BACKGROUND_SYNC_REQUEST").catch(()=>null);
   if(durable?.requestId===requestId)return {sent:true,accepted:true,requestId,source:"IDB"};
   const [opd,follow]=await Promise.all([this.getBackgroundSyncStatus_("OPD_TODAY",c,date).catch(()=>null),this.getBackgroundSyncStatus_("FOLLOWUP",c,date).catch(()=>null)]);
   const activeOrTerminal=x=>x&&String(x.requestId||"")===requestId&&["RUNNING","SUCCESS","FAILED","INCOMPLETE"].includes(x.status);
   return {sent:true,accepted:!!(activeOrTerminal(opd)||activeOrTerminal(follow)),requestId,source:"STATUS"};
  }catch(_){return {sent:false,accepted:false,requestId};}
 },
 startBackgroundCacheSync_(){
  if(this._backgroundTimersStarted)return;
  this._backgroundTimersStarted=true;
  const run=async()=>{
   try{
    const city=window.TodayCity?.resolve?.()||window.Schedule?.cityAtNow?.(window.NEURON_CONFIG?.cities||[])||"";
    if(!city)return;
    const date=this.todayKey_();
    await this.renderBackgroundSyncBar_();
    let shouldRequest=true;
    try{shouldRequest=await this.shouldRequestBackgroundSync_(city,date);}catch(_){shouldRequest=true;}
    if(shouldRequest)await this.requestBackgroundSyncToServiceWorker_(city);
    await this.renderBackgroundSyncBar_();
   }catch(_){}
  };
  this.bindBackgroundServiceWorkerMessages_();
  void run();
  window.setInterval(()=>{void run();},this.OPD_BACKGROUND_SYNC_INTERVAL_MS);
 },
 async getTodayOPDCache_(city,{forceRefresh=false}={}){
  const c=String(city||"").trim();
  const date=this.todayKey_();
  if(!c)throw Error("Today's OPD city is not selected.");
  await this.cleanupLegacyEEGCache_();
  await this.cleanupOldTodayOPDCaches_(date);
  const key=`OPD_TODAY|${date}|${c}`;
  let record=await this.get("cache",key).catch(()=>null);
  const stale=record ? (this.opdTodayCacheStale_(record,record.patients,"appointmentId") || record.status==="CACHED_INCOMPLETE" || record.status==="STALE") : false;
  if(record && !forceRefresh && !stale)return record;
  if(this._todayOPDRefreshes[key])return this._todayOPDRefreshes[key];
  const request=(async()=>{
   try{
    const r=await window.NeuronAPI.call("getTodayOPDFromProperties",{city:c,date:date},25000);
    if(!r||r.ok!==true)throw Error(r?.error||"Unable to retrieve today's OPD patient list.");
    const serverDate=/^\d{8}$/.test(String(r.date||""))?String(r.date):date;
    const serverCity=String(r.city||c).trim()||c;
    const patients=Array.isArray(r.patients)?r.patients:[];
    const now=Date.now();
    const serverKey=`OPD_TODAY|${serverDate}|${serverCity}`;
    const fresh={key:serverKey,type:"OPD_TODAY",date:serverDate,city:serverCity,patients,
      status:r.complete===false?"CACHED_INCOMPLETE":"REFRESHED",complete:r.complete===true,
      lastServerRefreshAt:now,lastServerCheckAt:now,cachedAt:now,
      lastSerial:Number(r.syncState?.serial)||null,lastRowNumber:Number(r.syncState?.rowNumber)||null};
    if(r.serialGapDetected===true||this.serialGap_(patients,"appointmentId"))fresh.status="STALE";
    await this.replace("cache",serverKey,fresh);
    return fresh;
   }catch(e){
    if(record)return record;
    throw e;
   }finally{
    delete this._todayOPDRefreshes[key];
   }
  })();
  this._todayOPDRefreshes[key]=request;
  return request;
 },
 async getTodayPatientsByWhatsApp_({city,whatsapp}={}){
  const c=String(city||"").trim();
  const phone=this.normalizeWhatsApp_(whatsapp);
  const date=this.todayKey_();
  if(!c||!/^[0-9]{10}$/.test(phone))return {source:"invalid",patients:[],cache:null};

  // IDB-first retrieval: read the complete OPD_TODAY cache record, then
  // apply the required context/WhatsApp filters locally. Do not contact the
  // server merely because a matching IDB patient is being searched.
  let cache=await this.get("cache",`OPD_TODAY|${date}|${c}`).catch(()=>null);
  let source="idb";
  if(!cache){
    cache=await this.getTodayOPDCache_(c,{forceRefresh:true});
    source="server";
  }

  const findPatients=record=>Array.isArray(record?.patients)?record.patients.filter(p=>{
    const sameContext=String(p?.city||c).trim()===c && String(p?.date||date).trim()===date;
    return sameContext && this.normalizeWhatsApp_(p?.whatsapp)===phone;
  }):[];
  let patients=findPatients(cache);

  // If the requested city + WhatsApp combination is absent from today's
  // local cache, perform the existing authoritative spreadsheet scan once,
  // repopulate OPD_TODAY, and retry the same local lookup. This handles
  // bookings created by another user/device after this browser's cache was
  // populated, without adding a server call to the normal IDB-hit path.
  if(cache&&patients.length===0){
    const refreshed=await this.getTodayOPDCache_(c,{forceRefresh:true});
    if(refreshed)cache=refreshed;
    source="server";
    patients=findPatients(cache);
  }

  const todayAppointmentFound=Array.isArray(cache?.patients)&&cache.patients.some(p=>String(p?.city||c).trim()===c&&String(p?.date||date).trim()===date);
  return {source,patients,cache,todayAppointmentFound};
 },
 followupVisitKey_(city,rowNumber){return `VISIT|${String(city||"").trim()}|${Number(rowNumber)}`;},
  followupMetaKey_(city){return `META|${String(city||"").trim()}`;},
  getFollowupMeta(city){return this.get("followupCache",this.followupMetaKey_(city));},
  getFollowupPatients_(city,whatsapp){
    const c=String(city||"").trim(),phone=this.normalizeWhatsApp_(whatsapp);if(!c||!/^[6-9]\d{9}$/.test(phone))return Promise.resolve([]);
    return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction("followupCache"),r=t.objectStore("followupCache").index("cityWhatsapp").getAll(IDBKeyRange.only([c,phone]));r.onsuccess=()=>ok((r.result||[]).filter(x=>x.type==="FOLLOWUP_VISIT"));r.onerror=()=>no(r.error);}));
  },
  followupBuildLockKey_(city){return `LOCK|${String(city||"").trim()}`;},
  async acquireFollowupBuildLock_(city,ttlMs=120000){
    const c=String(city||"").trim();if(!c)throw new Error("Follow-up city is required.");
    const d=await this.open(),key=this.followupBuildLockKey_(c),owner=`${Date.now()}-${Math.random().toString(36).slice(2)}`,now=Date.now();
    const acquired=await new Promise((ok,no)=>{let acquired=false;const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache"),r=st.get(key);r.onsuccess=()=>{const old=r.result;if(old&&Number(old.expiresAt)>now){acquired=false;return;}st.put({key,type:"FOLLOWUP_BUILD_LOCK",city:c,owner,expiresAt:now+ttlMs,updatedAt:now});acquired=true;};r.onerror=()=>no(r.error);t.oncomplete=()=>ok(acquired);t.onerror=()=>no(t.error||new Error("Follow-up build lock failed."));});
    return acquired?owner:null;
  },
  async renewFollowupBuildLock_(city,owner,ttlMs=120000){
    const c=String(city||"").trim();if(!c||!owner)return false;
    const d=await this.open(),key=this.followupBuildLockKey_(c),now=Date.now();
    return new Promise((ok,no)=>{let renewed=false;const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache"),r=st.get(key);r.onsuccess=()=>{if(r.result?.owner!==owner){renewed=false;return;}st.put({...r.result,expiresAt:now+ttlMs,updatedAt:now});renewed=true;};r.onerror=()=>no(r.error);t.oncomplete=()=>ok(renewed);t.onerror=()=>no(t.error||new Error("Follow-up build lock renewal failed."));t.onabort=()=>no(t.error||new Error("Follow-up build lock renewal aborted."));});
  },
  async releaseFollowupBuildLock_(city,owner){
    const c=String(city||"").trim();if(!c||!owner)return;
    const d=await this.open();
    await new Promise((ok,no)=>{const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache"),r=st.get(this.followupBuildLockKey_(c));r.onsuccess=()=>{if(r.result?.owner===owner)st.delete(this.followupBuildLockKey_(c));};r.onerror=()=>no(r.error);t.oncomplete=ok;t.onerror=()=>no(t.error||new Error("Follow-up build lock release failed."));});
  },
  async beginFollowupCityBuild(city){
    const c=String(city||"").trim();if(!c)throw new Error("Follow-up city is required.");
    await this.setFollowupMeta({city:c,type:"FOLLOWUP_META",status:"BUILDING",updatedAt:Date.now()});
    const d=await this.open();
    const keys=await new Promise((ok,no)=>{const t=d.transaction("followupCache"),idx=t.objectStore("followupCache").index("citySourceRow"),r=idx.getAllKeys(IDBKeyRange.bound([c,0],[c,Number.MAX_SAFE_INTEGER]));r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>no(r.error);});
    for(let i=0;i<keys.length;i+=500){
      const batch=keys.slice(i,i+500);
      await new Promise((ok,no)=>{const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache");batch.forEach(k=>st.delete(k));t.oncomplete=ok;t.onerror=()=>no(t.error||new Error("Unable to clear Follow-up cache build batch."));t.onabort=()=>no(t.error||new Error("Follow-up cache build clear aborted."));});
    }
  },
  putFollowupBuildBatch(city,records){
    const c=String(city||"").trim(),list=Array.isArray(records)?records:[];return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache");list.forEach(x=>{const row=Number(x?.sourceRow);if(!Number.isInteger(row)||row<2)return;st.put({...x,key:this.followupVisitKey_(c,row),type:"FOLLOWUP_VISIT",city:c,normalizedWhatsapp:this.normalizeWhatsApp_(x.whatsapp),sourceRow:row});});t.oncomplete=ok;t.onerror=()=>no(t.error||new Error("Follow-up cache batch write failed."));t.onabort=()=>no(t.error||new Error("Follow-up cache batch write aborted."));}));
  },
  countFollowupVisits_(city){
    const c=String(city||"").trim();if(!c)return Promise.resolve(0);
    return this.withConnectionRetry_(d=>new Promise((ok,no)=>{const t=d.transaction("followupCache"),idx=t.objectStore("followupCache").index("citySourceRow"),r=idx.getAllKeys(IDBKeyRange.bound([c,2],[c,Number.MAX_SAFE_INTEGER]));r.onsuccess=()=>ok((r.result||[]).length);r.onerror=()=>no(r.error);}));
  },
  getFollowupSourceBounds_(city){
    const c=String(city||"").trim();if(!c)return Promise.resolve({count:0,lowestSourceRow:1});
    return this.withConnectionRetry_(d=>new Promise((ok,no)=>{
      const t=d.transaction("followupCache"),idx=t.objectStore("followupCache").index("citySourceRow"),r=idx.getAllKeys(IDBKeyRange.bound([c,2],[c,Number.MAX_SAFE_INTEGER]));
      r.onsuccess=()=>{const keys=r.result||[];let lowest=Number.MAX_SAFE_INTEGER;keys.forEach(k=>{const row=Number(String(k||"").split("|").pop());if(Number.isInteger(row)&&row>=2&&row<lowest)lowest=row;});ok({count:keys.length,lowestSourceRow:Number.isFinite(lowest)?lowest:1});};
      r.onerror=()=>no(r.error);
    }));
  },
  setFollowupMeta(meta){const c=String(meta?.city||"").trim();return this.put("followupCache",{...meta,key:this.followupMetaKey_(c),type:"FOLLOWUP_META",city:c});},
  finishFollowupCityBuild(city,meta){const c=String(city||"").trim();return this.setFollowupMeta({...meta,city:c,status:"READY",lastUpdatedAt:Date.now()});},
  async pruneFollowupCity(city,boundaryDate,lastCleanupMonth){
    const c=String(city||"").trim(),boundary=String(boundaryDate||"");if(!c||!/^[0-9]{8}$/.test(boundary))return;
    const d=await this.open();
    const keys=await new Promise((ok,no)=>{const t=d.transaction("followupCache"),idx=t.objectStore("followupCache").index("cityDate"),r=idx.getAllKeys(IDBKeyRange.bound([c,"00000000"],[c,boundary],false,true));r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>no(r.error);});
    for(let i=0;i<keys.length;i+=250){
      const batch=keys.slice(i,i+250);
      await new Promise((ok,no)=>{const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache");batch.forEach(k=>st.delete(k));t.oncomplete=ok;t.onerror=()=>no(t.error||new Error("Follow-up cache cleanup batch failed."));t.onabort=()=>no(t.error||new Error("Follow-up cache cleanup batch aborted."));});
    }
    const m=await this.getFollowupMeta(c);if(m){const bounds=await this.getFollowupSourceBounds_(c);await this.setFollowupMeta({...m,lastCleanupMonth,boundaryDate:boundary,status:"READY",recordCount:bounds.count,lowestSourceRow:bounds.lowestSourceRow,lastUpdatedAt:Date.now()});}
  },
  followupSyncLockKey_(city){return `SYNC|${String(city||"").trim()}`;},
  async releaseFollowupSyncLock_(city,owner){
    const c=String(city||"").trim();if(!c||!owner)return;
    const d=await this.open();
    await new Promise((ok,no)=>{const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache"),r=st.get(this.followupSyncLockKey_(c));r.onsuccess=()=>{if(r.result?.owner===owner)st.delete(this.followupSyncLockKey_(c));};r.onerror=()=>no(r.error);t.oncomplete=ok;t.onerror=()=>no(t.error||new Error("Follow-up synchronization lock release failed."));});
  },
  followupMetaValid_(meta,city){
    const c=String(city||"").trim();
    if(!meta||meta.status!=="READY"||String(meta.city||"").trim()!==c)return false;
    const known=Number(meta.highestKnownSourceRow),contiguous=Number(meta.highestContiguousSourceRow),lowest=Number(meta.lowestSourceRow),count=Number(meta.recordCount);
    return Number.isInteger(known)&&known>=1&&Number.isInteger(contiguous)&&contiguous>=1&&Number.isInteger(lowest)&&lowest>=1&&Number.isInteger(count)&&count>=0&&contiguous<=known&&lowest<=known;
  },
  async buildFollowupCityCache_(city,options={}){
    const c=String(city||"").trim();if(!c)throw new Error("Follow-up city is required.");
    const skipLegacyLock=options?.skipLegacyLock===true;
    if(skipLegacyLock){
      const meta=await this.getFollowupMeta(c);
      if(this.followupMetaValid_(meta,c))return {mode:"ALREADY_READY",city:c,recordCount:Number(meta.recordCount)||0};
      await this.beginFollowupCityBuild(c);
      try{
        const r=await window.NeuronAPI.call("getFollowupCityHistory",{city:c},100000);
        if(!r||r.ok!==true)throw new Error(r?.error||"Unable to build Follow-up history.");
        const records=Array.isArray(r.records)?r.records:[],BATCH=500;
        for(let i=0;i<records.length;i+=BATCH)await this.putFollowupBuildBatch(c,records.slice(i,i+BATCH));
        const written=await this.countFollowupVisits_(c);
        if(written!==records.length)throw new Error("Follow-up cache build verification failed.");
        const p=window.U?.parts?.()||{},safeMonth=p.y?`${p.y}-${String(p.m).padStart(2,"0")}`:"",now=Date.now();
        const next={city:c,boundaryDate:String(r.boundaryDate||""),oldestDate:records[0]?.date||"",newestDate:records[records.length-1]?.date||"",recordCount:records.length,lowestSourceRow:Number(records[0]?.sourceRow)||1,highestKnownSourceRow:Number(r.highestKnownSourceRow)||1,highestContiguousSourceRow:Number(r.highestContiguousSourceRow)||1,createdAt:now,lastFullBuildAt:now,lastServerCheckAt:now,lastCleanupMonth:safeMonth,lastServerCheckDate:this.todayKey_()};
        await this.finishFollowupCityBuild(c,next);
        return {mode:"FULL_BUILD",city:c,rowsLoaded:records.length,oldestDate:next.oldestDate,newestDate:next.newestDate,highestKnownSourceRow:next.highestKnownSourceRow,highestContiguousSourceRow:next.highestContiguousSourceRow};
      }catch(e){
        await this.setFollowupMeta({city:c,status:"BUILD_FAILED",lastUpdatedAt:Date.now()}).catch(()=>{});
        throw e;
      }
    }
    let owner=null,renewTimer=null,lockLost=false;
    try{
      const deadline=Date.now()+130000;
      while(Date.now()<deadline){
        const meta=await this.getFollowupMeta(c);
        if(this.followupMetaValid_(meta,c))return {mode:"ALREADY_READY",city:c,recordCount:Number(meta.recordCount)||0};
        owner=await this.acquireFollowupBuildLock_(c,120000);
        if(owner)break;
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      if(!owner)throw new Error("Follow-up cache build is already in progress. Please try again.");
      const renew=async()=>{if(!owner)return false;return this.renewFollowupBuildLock_(c,owner,120000).catch(()=>false);};
      renewTimer=setInterval(()=>{void renew().then(ok=>{if(!ok)lockLost=true;}).catch(()=>{lockLost=true;});},30000);
      await this.beginFollowupCityBuild(c);
      try{
        const r=await window.NeuronAPI.call("getFollowupCityHistory",{city:c},100000);
        if(!r||r.ok!==true)throw new Error(r?.error||"Unable to build Follow-up history.");
        const records=Array.isArray(r.records)?r.records:[],BATCH=500;
        for(let i=0;i<records.length;i+=BATCH)await this.putFollowupBuildBatch(c,records.slice(i,i+BATCH));
        const written=await this.countFollowupVisits_(c);
        if(written!==records.length)throw new Error("Follow-up cache build verification failed.");
        if(lockLost || !(await this.renewFollowupBuildLock_(c,owner,120000)))throw new Error("Follow-up cache build lock was lost before commit.");
        const p=window.U?.parts?.()||{},safeMonth=p.y?`${p.y}-${String(p.m).padStart(2,"0")}`:"",now=Date.now();
        const meta={city:c,boundaryDate:String(r.boundaryDate||""),oldestDate:records[0]?.date||"",newestDate:records[records.length-1]?.date||"",recordCount:records.length,lowestSourceRow:Number(records[0]?.sourceRow)||1,highestKnownSourceRow:Number(r.highestKnownSourceRow)||1,highestContiguousSourceRow:Number(r.highestContiguousSourceRow)||1,createdAt:now,lastFullBuildAt:now,lastServerCheckAt:now,lastCleanupMonth:safeMonth,lastServerCheckDate:this.todayKey_()};
        await this.finishFollowupCityBuild(c,meta);
        return {mode:"FULL_BUILD",city:c,rowsLoaded:records.length,oldestDate:meta.oldestDate,newestDate:meta.newestDate,highestKnownSourceRow:meta.highestKnownSourceRow,highestContiguousSourceRow:meta.highestContiguousSourceRow};
      }catch(e){await this.setFollowupMeta({city:c,status:"BUILD_FAILED",lastUpdatedAt:Date.now()}).catch(()=>{});throw e;}
    }finally{if(renewTimer)clearInterval(renewTimer);if(owner)await this.releaseFollowupBuildLock_(c,owner).catch(()=>{});}
  },
  async syncFollowupCityCache_(city,options={}){
    const c=String(city||"").trim();if(!c)return {mode:"FAILED",error:"Follow-up city is required."};
    const skipLegacyLock=options?.skipLegacyLock===true;
    let owner=null;
    if(!skipLegacyLock){
      const lockKey=this.followupSyncLockKey_(c),d=await this.open(),now=Date.now();
      owner=`${now}-${Math.random().toString(36).slice(2)}`;
      const locked=await new Promise((ok,no)=>{let acquired=false;const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache"),r=st.get(lockKey);r.onsuccess=()=>{if(r.result&&Number(r.result.expiresAt)>now){acquired=false;return;}st.put({key:lockKey,type:"FOLLOWUP_SYNC_LOCK",city:c,owner,expiresAt:now+120000,updatedAt:now});acquired=true;};r.onerror=()=>no(r.error);t.oncomplete=()=>ok(acquired);t.onerror=()=>no(t.error||new Error("Follow-up synchronization lock failed."));});
      if(!locked)return {mode:"IN_PROGRESS",city:c};
    }
    try{
      const meta=await this.getFollowupMeta(c);
      if(!this.followupMetaValid_(meta,c))return {mode:"FAILED",city:c,error:"Follow-up cache metadata is not valid for incremental synchronization."};
      const previousContiguous=Number(meta.highestContiguousSourceRow)||1;
      const from=Math.max(2,previousContiguous+1);
      const r=await window.NeuronAPI.call("getFollowupCitySyncRange",{city:c,fromRow:from},100000);
      if(!r||r.ok!==true)throw new Error(r?.error||"Unable to synchronize Follow-up history.");
      const toRow=Number(r.toRow)||0;
      const spreadsheetLastRow=Math.max(toRow,Number(r.highestKnownSourceRow)||0);
      if(spreadsheetLastRow<from){
        const current=await this.getFollowupMeta(c);
        if(current&&current.status==="READY")await this.setFollowupMeta({...current,city:c,lastUpdatedAt:Date.now(),lastServerCheckAt:Date.now(),lastServerCheckDate:this.todayKey_()});
        return {mode:"ALREADY_CURRENT",city:c,idbContiguousRow:previousContiguous,spreadsheetLastRow,rowsScanned:0};
      }
      const records=Array.isArray(r.records)?r.records:[];let inserted=0,updated=0;
      for(let i=0;i<records.length;i+=250){const counts=await this.putFollowupSyncBatch_(c,records.slice(i,i+250));inserted+=counts.inserted;updated+=counts.updated;}
      const current=await this.getFollowupMeta(c);
      if(!current||current.status!=="READY")throw new Error("Follow-up cache metadata changed during synchronization.");
      const newContiguous=Math.max(Number(current.highestContiguousSourceRow)||0,toRow);
      const newKnown=Math.max(Number(current.highestKnownSourceRow)||0,spreadsheetLastRow);
      const nextCount=Math.max(0,Number(current.recordCount)||0)+inserted;
      await this.setFollowupMeta({...current,city:c,status:"READY",lowestSourceRow:Number(current.lowestSourceRow)||1,highestKnownSourceRow:newKnown,highestContiguousSourceRow:newContiguous,recordCount:nextCount,lastUpdatedAt:Date.now(),lastSyncAt:Date.now(),lastServerCheckAt:Date.now(),lastServerCheckDate:this.todayKey_()});
      return {mode:"INCREMENTAL",city:c,fromRow:from,toRow,rowsReceived:records.length,rowsInserted:inserted,rowsUpdated:updated,previousContiguousRow:previousContiguous,newContiguousRow:newContiguous,spreadsheetLastRow:spreadsheetLastRow};
    }catch(e){const meta=await this.getFollowupMeta(c).catch(()=>null);return {mode:"FAILED",city:c,error:e?.message||String(e),previousContiguousRow:Number(meta?.highestContiguousSourceRow)||0};}
    finally{if(!skipLegacyLock&&owner)await this.releaseFollowupSyncLock_(c,owner).catch(()=>{});}
  },
  putFollowupSyncBatch_(city,records){
    const c=String(city||"").trim(),list=Array.isArray(records)?records:[];
    return this.withConnectionRetry_(d=>new Promise((ok,no)=>{
      const t=d.transaction("followupCache","readwrite"),st=t.objectStore("followupCache");
      let inserted=0,updated=0,remaining=list.length;
      if(!remaining){ok({inserted:0,updated:0});return;}
      list.forEach(x=>{
        const row=Number(x?.sourceRow);
        if(!Number.isInteger(row)||row<2){remaining--;return;}
        const key=this.followupVisitKey_(c,row),r=st.get(key);
        r.onsuccess=()=>{
          const visit={...x,key,type:"FOLLOWUP_VISIT",city:c,normalizedWhatsapp:this.normalizeWhatsApp_(x.whatsapp),sourceRow:row};
          if(r.result)updated++;else inserted++;
          st.put(visit);
          remaining--;
        };
        r.onerror=()=>no(r.error);
      });
      t.oncomplete=()=>ok({inserted,updated});
      t.onerror=()=>no(t.error||new Error("Follow-up synchronization batch failed."));
      t.onabort=()=>no(t.error||new Error("Follow-up synchronization batch aborted."));
    }));
  },
  async reconcileFollowupCityGaps_(city){
    return this.syncFollowupCityCache_(city);
  },
  pageOwnerId_(){
    try{let id=sessionStorage.getItem("neuron_page_owner_id");if(!id){id=`PAGE-${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem("neuron_page_owner_id",id);}return id;}catch(_){return `PAGE-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
  },
  manualFollowupRebuildLeaseKey_(city){return `MANUAL_REBUILD|${String(city||"").trim()}`;},
  async acquireManualFollowupRebuildLease_(city){
    const c=String(city||"").trim();if(!c)throw new Error("Follow-up city is required.");
    const owner=`${this.pageOwnerId_()}-${Date.now()}`,now=Date.now(),key=this.manualFollowupRebuildLeaseKey_(c),d=await this.open();
    return new Promise((ok,no)=>{const t=d.transaction("meta","readwrite"),st=t.objectStore("meta"),r=st.get(key);let result=null;r.onsuccess=()=>{const old=r.result;if(old&&Number(old.leaseExpiresAt)>now){result=null;return;}result={key,city:c,type:"MANUAL_FOLLOWUP_REBUILD_LEASE",owner,leaseExpiresAt:now+this.MANUAL_FOLLOWUP_REBUILD_LEASE_MS,lastHeartbeatAt:now,updatedAt:now};st.put(result);};r.onerror=()=>no(r.error);t.oncomplete=()=>ok(result);t.onerror=()=>no(t.error||new Error("Manual Follow-up rebuild lease acquisition failed."));t.onabort=()=>no(t.error||new Error("Manual Follow-up rebuild lease acquisition aborted."));});
  },
  async renewManualFollowupRebuildLease_(city,owner){
    const c=String(city||"").trim();if(!c||!owner)return false;const now=Date.now(),key=this.manualFollowupRebuildLeaseKey_(c),d=await this.open();
    return new Promise((ok,no)=>{const t=d.transaction("meta","readwrite"),st=t.objectStore("meta"),r=st.get(key);let renewed=false;r.onsuccess=()=>{if(r.result?.owner!==owner)return;st.put({...r.result,lastHeartbeatAt:now,leaseExpiresAt:now+this.MANUAL_FOLLOWUP_REBUILD_LEASE_MS,updatedAt:now});renewed=true;};r.onerror=()=>no(r.error);t.oncomplete=()=>ok(renewed);t.onerror=()=>no(t.error||new Error("Manual Follow-up rebuild lease renewal failed."));t.onabort=()=>no(t.error||new Error("Manual Follow-up rebuild lease renewal aborted."));});
  },
  async releaseManualFollowupRebuildLease_(city,owner){
    const c=String(city||"").trim();if(!c||!owner)return;const d=await this.open(),key=this.manualFollowupRebuildLeaseKey_(c);
    await new Promise((ok,no)=>{const t=d.transaction("meta","readwrite"),st=t.objectStore("meta"),r=st.get(key);r.onsuccess=()=>{if(r.result?.owner===owner)st.delete(key);};r.onerror=()=>no(r.error);t.oncomplete=ok;t.onerror=()=>no(t.error||new Error("Manual Follow-up rebuild lease release failed."));});
  },
  async withManualFollowupRebuildLease_(city,operation){
    const lease=await this.acquireManualFollowupRebuildLease_(city);
    if(!lease)return {mode:"IN_PROGRESS",city:String(city||"").trim()};
    let timer=null,active=true;
    try{
      timer=setInterval(()=>{void this.renewManualFollowupRebuildLease_(city,lease.owner).then(ok=>{if(!ok)active=false;}).catch(()=>{active=false;});},this.MANUAL_FOLLOWUP_REBUILD_HEARTBEAT_MS);
      const result=await operation();
      if(!active)throw new Error("Manual Follow-up rebuild lease was lost.");
      return result;
    }finally{if(timer)clearInterval(timer);await this.releaseManualFollowupRebuildLease_(city,lease.owner).catch(()=>{});}
  },
  async rebuildFollowupCityCache_(city){
    const c=String(city||"").trim();if(!c)return {mode:"FAILED",error:"Follow-up city is required."};
    return this.withManualFollowupRebuildLease_(c,async()=>{
      const meta=await this.getFollowupMeta(c);
      if(!this.followupMetaValid_(meta,c)){try{return await this.buildFollowupCityCache_(c,{skipLegacyLock:true});}catch(e){return {mode:"FAILED",city:c,error:e?.message||String(e)};}}
      return this.syncFollowupCityCache_(c,{skipLegacyLock:true});
    });
  },

  async getOrBuildFollowupPatients_(city,whatsapp){
    const c=String(city||"").trim(),phone=this.normalizeWhatsApp_(whatsapp);
    if(!c||!/^[6-9]\d{9}$/.test(phone))return {patients:[],authoritativeNegative:false};
    let meta=await this.getFollowupMeta(c);
    if(!this.followupMetaValid_(meta,c)){
      const built=await this.buildFollowupCityCache_(c);
      if(built?.mode==="FAILED")throw new Error(built.error||"Unable to build Follow-up cache.");
      meta=await this.getFollowupMeta(c);
    }
    let patients=await this.getFollowupPatients_(c,phone);
    const p=window.U?.parts?.()||{};
    patients=patients.sort((a,b)=>{const at=String(a.date||"")+String(a.time||"");const bt=String(b.date||"")+String(b.time||"");return bt.localeCompare(at)||(Number(b.sourceRow)||0)-(Number(a.sourceRow)||0);});
    const meta2=await this.getFollowupMeta(c),month=p.y?`${p.y}-${String(p.m).padStart(2,"0")}`:"";
    if(meta2&&meta2.status==="READY"&&month&&meta2.lastCleanupMonth!==month){
      const boundaryDate=new Date(Date.UTC(Number(p.y)-2,Number(p.m)-1,Number(p.d)||1));
      const boundary=`${boundaryDate.getUTCFullYear()}${String(boundaryDate.getUTCMonth()+1).padStart(2,"0")}${String(boundaryDate.getUTCDate()).padStart(2,"0")}`;
      void this.pruneFollowupCity(c,boundary,month).catch(()=>{});
    }
    if(meta2&&meta2.status==="READY"&&Number(meta2.highestKnownSourceRow)>Number(meta2.highestContiguousSourceRow||0)){
      void this.reconcileFollowupCityGaps_(c).catch(()=>{});
    }
    const authoritativeNegative=patients.length===0&&this.followupMetaValid_(meta2,c)&&Number(meta2.highestKnownSourceRow)===Number(meta2.highestContiguousSourceRow)&&this.followupCheckedToday_(meta2);
    if(patients.length===0&&!authoritativeNegative){
      try{
        const fallback=await window.NeuronAPI.call("getPatientHistoryByWhatsApp",{city:c,whatsapp:phone},25000);
        const serverPatients=Array.isArray(fallback?.patients)?fallback.patients:[];
        return {patients:serverPatients,authoritativeNegative:false,serverFallback:true};
      }catch(e){
        throw e;
      }
    }
    return {patients,authoritativeNegative,serverFallback:false};
  },
  
  async updateTodayOPDFromMutation_(mutation={}){
    const kind=String(mutation.kind||"").trim();
    const supported=["OPD_BOOKING","OPD_UPDATE","EEG_BOOKING","EEG_UPDATE","REFUND"];
    if(supported.indexOf(kind)<0)return {updated:false,reason:"unsupported_mutation"};

    const result=mutation.result&&typeof mutation.result==="object"?mutation.result:{};
    const payload=mutation.payload&&typeof mutation.payload==="object"?mutation.payload:{};
    const resultPatient=result.patient&&typeof result.patient==="object"?result.patient:result;
    const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key)&&obj[key]!==undefined;
    const pick=(key,fallback=null)=>has(resultPatient,key)?resultPatient[key]:has(result,key)?result[key]:has(payload,key)?payload[key]:fallback;
    const appointmentId=String(pick("appointmentId","")||"").trim();
    const city=String(pick("city","")||"").trim();
    const dateRaw=String(pick("date",pick("appointmentDate",this.todayKey_()))||"").trim();
    const date=/^\d{8}$/.test(dateRaw)?dateRaw:this.todayKey_();
    if(!appointmentId||!city)return {updated:false,reason:"mutation_identity_missing"};
    if(date!==this.todayKey_())return {updated:false,reason:"not_today"};

    let cache=await this.get("cache",`OPD_TODAY|${date}|${city}`).catch(()=>null);
    const cacheInvalid=!cache||!Array.isArray(cache.patients)||cache.status==="CACHED_INCOMPLETE"||cache.status==="STALE";
    if(cacheInvalid){
      cache=await this.getTodayOPDCache_(city,{forceRefresh:true}).catch(()=>null);
    }

    const patch={};
    const setIfAvailable=(key,target=key)=>{
      const v=pick(key,undefined);
      if(v!==undefined)patch[target]=v;
    };

    if(kind==="OPD_BOOKING"){
      [
        ["patientName","name"],["age","age"],["ageUnit","ageUnit"],["address","address"],
        ["patientType","patientType"],["whatsapp","whatsapp"],["city","city"],
        ["referredBy","referredBy"],["nextFollowupCity","nextFollowupCity"],
        ["opdCharges","opdCharges"],["opdCharges","totalOPDCharges"],
        ["opdCashPaid","opdCashPaid"],["opdOnlinePaid","opdOnlinePaid"],
        ["opdTotalPaid","opdTotalPaid"],["bookingRequestId","bookingRequestId"]
      ].forEach(([a,b])=>setIfAvailable(a,b));
      patch.eegCharges=null;
      patch.eegCashPaid=null;
      patch.eegOnlinePaid=null;
      patch.eegTotalPaid=null;
      patch.eegBookingRequestId=has(resultPatient,"eegBookingRequestId")?resultPatient.eegBookingRequestId:null;
      patch.eegUpdateRequestId=has(resultPatient,"eegUpdateRequestId")?resultPatient.eegUpdateRequestId:null;
      patch.opdRefund=has(resultPatient,"opdRefund")?resultPatient.opdRefund:null;
      patch.eegRefund=has(resultPatient,"eegRefund")?resultPatient.eegRefund:null;
      patch.opdRefundProvided=has(resultPatient,"opdRefundProvided")?resultPatient.opdRefundProvided:false;
      patch.eegRefundProvided=has(resultPatient,"eegRefundProvided")?resultPatient.eegRefundProvided:false;
    }else if(kind==="EEG_BOOKING"){
      ["eegCharges","eegCashPaid","eegOnlinePaid","eegTotalPaid","eegBookingRequestId","eegUpdateRequestId"].forEach(k=>setIfAvailable(k,k));
    }else if(kind==="OPD_UPDATE"){
      [
        ["name","name"],["age","age"],["ageUnit","ageUnit"],["address","address"],
        ["referredBy","referredBy"],["whatsappNew","whatsapp"],["whatsapp","whatsapp"],
        ["nextFollowupCity","nextFollowupCity"],["opdCharges","opdCharges"],
        ["opdCharges","totalOPDCharges"],["opdCashPaid","opdCashPaid"],["opdOnlinePaid","opdOnlinePaid"],
        ["opdTotalPaid","opdTotalPaid"]
      ].forEach(([a,b])=>{
        const sourceKey=(a==="whatsappNew"&&!has(resultPatient,a)&&!has(result,a))?"whatsapp":a;
        setIfAvailable(sourceKey,b);
      });
      if(has(resultPatient,"patientType"))patch.patientType=resultPatient.patientType;
    }else if(kind==="EEG_UPDATE"){
      ["eegCharges","eegCashPaid","eegOnlinePaid"].forEach(k=>setIfAvailable(k,k));
      if(has(resultPatient,"eegTotalPaid"))patch.eegTotalPaid=resultPatient.eegTotalPaid;
      else if(has(payload,"eegCharges"))patch.eegTotalPaid=payload.eegCharges;
    }else if(kind==="REFUND"){
      const updateOPD=payload.updateOPD===true||payload.updateOPD==="true";
      const updateEEG=payload.updateEEG===true||payload.updateEEG==="true";
      if(updateOPD){
        const v=pick("opdRefund",undefined);
        if(v!==undefined){patch.opdRefund=v;patch.opdRefundProvided=Number(v)>0;}
      }
      if(updateEEG){
        const v=pick("eegRefund",undefined);
        if(v!==undefined){patch.eegRefund=v;patch.eegRefundProvided=Number(v)>0;}
      }
    }

    if(!cache||!Array.isArray(cache.patients)){
      cache={key:`OPD_TODAY|${date}|${city}`,type:"OPD_TODAY",date,city,patients:[],status:"CACHED_INCOMPLETE",complete:false,cacheUpdatedAt:Date.now()};
    }
    const patients=Array.isArray(cache.patients)?cache.patients.slice():[];
    let i=patients.findIndex(x=>String(x?.appointmentId||"").trim()===appointmentId);
    if(i<0){
      if(kind!=="OPD_BOOKING"){
        const refreshed=await this.getTodayOPDCache_(city,{forceRefresh:true}).catch(()=>null);
        if(refreshed&&Array.isArray(refreshed.patients)){
          cache=refreshed;
          patients.splice(0,patients.length,...refreshed.patients);
          i=patients.findIndex(x=>String(x?.appointmentId||"").trim()===appointmentId);
        }
      }
    }
    if(i<0&&kind!=="OPD_BOOKING")return {updated:false,reason:"patient_missing"};

    const base=i>=0?{...patients[i]}:{
      appointmentId,date,time:String(pick("time","")||""),name:String(pick("patientName",pick("name",""))||""),
      rowNumber:Number(pick("rowNumber",null))||null,
      age:pick("age",null),ageUnit:String(pick("ageUnit","")||""),address:String(pick("address","")||""),
      patientType:String(pick("patientType","Follow-up")||""),whatsapp:String(pick("whatsapp","")||""),city,
      referredBy:String(pick("referredBy","")||""),nextFollowupCity:String(pick("nextFollowupCity","")||""),
      opdCharges:null,totalOPDCharges:null,opdCashPaid:null,opdOnlinePaid:null,opdTotalPaid:null,
      opdRefund:null,eegRefund:null,opdRefundProvided:false,eegRefundProvided:false,
      eegCharges:null,eegCashPaid:null,eegOnlinePaid:null,eegTotalPaid:null,
      bookingRequestId:null,eegBookingRequestId:null,eegUpdateRequestId:null
    };
    Object.keys(patch).forEach(k=>{base[k]=patch[k];});
    if(i>=0)patients[i]=base;else patients.push(base);
    patients.sort((a,b)=>{
      const sa=Number(String(a?.appointmentId||"").match(/-(\d+)$/)?.[1]),sb=Number(String(b?.appointmentId||"").match(/-(\d+)$/)?.[1]);
      if(Number.isFinite(sa)&&Number.isFinite(sb)&&sa!==sb)return sa-sb;
      return String(a?.time||"").localeCompare(String(b?.time||""));
    });
    const now=Date.now();
    const next={...cache,patients,cacheUpdatedAt:now,lastServerCheckAt:cache.lastServerCheckAt||now};
    if(kind==="OPD_BOOKING"){
      const serial=Number(pick("serial",String(appointmentId).match(/-(\d+)$/)?.[1]))||null;
      const row=Number(pick("rowNumber",null))||null;
      if(serial&&row){next.lastSerial=Math.max(Number(next.lastSerial)||0,serial);next.lastRowNumber=Math.max(Number(next.lastRowNumber)||1,row);next.lastServerCheckAt=now;next.lastServerRefreshAt=now;}
    }
    next.status=next.complete===true?"REFRESHED":next.status||"REFRESHED";
    if(next.complete===undefined)next.complete=true;
    await this.replace("cache",`OPD_TODAY|${date}|${city}`,next);
    return {updated:true,patient:base,kind,appointmentId,city,date};
  },

  async syncEEGCallsBookingCache_(booking){
    const b=booking&&typeof booking==="object"?booking:{};
    const rowNumber=Number(b.rowNumber);
    if(!Number.isInteger(rowNumber)||rowNumber<2)return {eegCallsUpdated:false};
    return this.withConnectionRetry_(d=>new Promise((ok,no)=>{
      const t=d.transaction("cache","readwrite"),st=t.objectStore("cache"),key="eegCallsRawCacheV1";
      const r=st.get(key);
      r.onsuccess=()=>{
        const cache=r.result;
        if(!cache||!Array.isArray(cache.records)){ok({eegCallsUpdated:false});return;}
        const record={rowNumber,appointmentId:String(b.appointmentId||""),date:String(b.date||""),dateKey:/^\d{8}$/.test(String(b.date||""))?String(b.date):"",time:String(b.time||""),patientName:String(b.patientName||b.name||""),age:b.age,ageUnit:String(b.ageUnit||""),ageText:(b.age!=null&&b.ageUnit)?`${b.age} ${b.ageUnit}`:"",address:String(b.address||""),whatsapp:String(b.whatsapp||""),referredBy:String(b.referredBy||""),paymentReceived:Number(b.paymentReceived)||0,eegTechnician:String(b.eegTechnician||"")};
        const byRow=new Map(cache.records.map(x=>[Number(x?.rowNumber),x]));byRow.set(rowNumber,record);
        let records=Array.from(byRow.values()).sort((a,b)=>(Number(a.rowNumber)||0)-(Number(b.rowNumber)||0));if(records.length>120)records=records.slice(-120);
        st.put({...cache,records,lastScannedRow:Math.max(Number(cache.lastScannedRow)||0,rowNumber),lastDataUpdatedAt:Date.now()});
        ok({eegCallsUpdated:true});
      };
      r.onerror=()=>no(r.error);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error||new Error("EEG Calls cache synchronization aborted."));
    }));
  },


};


// Start the persistent Background Sync coordinator once the page is ready.
// The coordinator itself owns the cross-page/date/lease gates, so navigation
// or multiple script entry points cannot create duplicate cycles.
const startNeuronBackgroundSync_=()=>{try{window.IDB?.startBackgroundCacheSync_?.();}catch(_){}};
if(document.readyState==="loading")window.addEventListener("load",startNeuronBackgroundSync_,{once:true});
else startNeuronBackgroundSync_();
