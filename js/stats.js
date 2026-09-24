document.addEventListener("DOMContentLoaded",()=>{
 const $=U.$;
 $("city").innerHTML=
   `<option value="all">All City Combined</option>`+
   NEURON_CONFIG.cities.map(x=>`<option value="${U.esc(x)}">${U.esc(x)}</option>`).join("");
 const defaultDailyCity=window.DailyCity?.get?.()||(
   window.Schedule&&typeof Schedule.cityAtNow==="function"
     ? Schedule.cityAtNow(NEURON_CONFIG.cities)
     : "Latur"
 );
 if(NEURON_CONFIG.cities.includes(defaultDailyCity)) $("city").value=defaultDailyCity;
 const q=U.parts(),cur=`${q.y}-${String(q.m).padStart(2,"0")}`;
 $("period").innerHTML=
   `<option value="today">Today</option>
    <option value="yesterday">Yesterday</option>
    <option value="daybefore">Day Before Yesterday</option>
    <option value="${cur}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(q.y,q.m-1,1)))}</option>
    <option value="${(()=>{const d=new Date(Date.UTC(q.y,q.m-2,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`})()}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(q.y,q.m-2,1)))}</option>
    <option value="${(()=>{const d=new Date(Date.UTC(q.y,q.m-3,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`})()}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(q.y,q.m-3,1)))}</option>
    <option value="${(()=>{const d=new Date(Date.UTC(q.y,q.m-4,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`})()}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(q.y,q.m-4,1)))}</option>
    <option value="last12">Last 12 Months</option>
    <option value="last5">Last 5 Years</option>
    <option value="currentyear">${q.y}</option>
    <option value="lastyear">${q.y-1}</option>
    <option value="${q.y-2}">${q.y-2}</option>
    <option value="${q.y-3}">${q.y-3}</option>
    <option value="${q.y-4}">${q.y-4}</option>
    <option value="${q.y-5}">${q.y-5}</option>`;

 function retrievalPeriodLabel(period){
   const q=U.parts();
   const base=new Date(Date.UTC(q.y,q.m-1,q.d));
   let offset=null, prefix="";
   if(period==="today"){offset=0;prefix="Today";}
   else if(period==="yesterday"){offset=1;prefix="Yesterday";}
   else if(period==="daybefore"){offset=2;prefix="Day before Yesterday";}
   if(offset===null)return null;
   const d=new Date(base);
   d.setUTCDate(d.getUTCDate()-offset);
   const dateText=new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(d);
   return `${prefix} (${dateText})`;
 }

 function selectedDateForDailyPeriod_(period){
   const q=U.parts();
   const offset=period==="today"?0:period==="yesterday"?1:period==="daybefore"?2:null;
   if(offset===null)return null;
   const d=new Date(Date.UTC(q.y,q.m-1,q.d));
   d.setUTCDate(d.getUTCDate()-offset);
   return d;
 }

 function scheduledCitiesForDate_(date){
   if(!date||!window.Schedule||typeof Schedule.hours!=="function")return [];
   const y=date.getUTCFullYear();
   const m=date.getUTCMonth()+1;
   const d=date.getUTCDate();
   return NEURON_CONFIG.cities.filter(city=>Schedule.hours(city,y,m,d)!==null);
 }
 function prepareScheduleAwareDailyTrend_(trendData, city, period){
   if(!trendData || !Array.isArray(trendData.daily) || !city || String(city).toLowerCase()==="all") return trendData;
   if(!window.Schedule || typeof Schedule.dates!=="function") return trendData;
   const q=U.parts();
   let y=q.y,m=q.m;
   if(/^\d{4}-\d{2}$/.test(String(period||""))){
     const parts=String(period).split("-").map(Number);
     y=parts[0];m=parts[1];
   }
   const todayKey=`${q.y}${String(q.m).padStart(2,"0")}${String(q.d).padStart(2,"0")}`;
   const isCurrentMonth=(y===q.y&&m===q.m);
   const counts=new Map();
   trendData.daily.forEach(item=>{
     const key=String(item.date||"");
     if(/^\d{8}$/.test(key)) counts.set(key,{date:key,opd:Number(item.opd)||0,eeg:Number(item.eeg)||0});
   });
   const scheduled=Schedule.dates(city,y,m)||[];
   const out=[];
   scheduled.forEach(ddmmyyyy=>{
     const s=String(ddmmyyyy||"");
     if(!/^\d{8}$/.test(s)) return;
     const key=s.slice(4,8)+s.slice(2,4)+s.slice(0,2);
     if(isCurrentMonth && key>todayKey) return;
     const item=counts.get(key);
     out.push(item||{date:key,opd:0,eeg:0});
   });
   return Object.assign({},trendData,{daily:out});
 }

 function sourceCitiesForDailyPeriod_(period){
   return scheduledCitiesForDate_(selectedDateForDailyPeriod_(period));
 }

 const HISTORY_KEY="neuron_statistics_history_access";
 const HISTORY_PASSWORD_HASH="114f4b4bbf1f4a3a58064199f0e9d241566f356756ee58e5d160d3937e6ac740";
 function hasHistoricalAccess(){return localStorage.getItem(HISTORY_KEY)==="1";}
 function focusHistoricalAccess(){
   const input=$("historyPassword");
   if(!input)return;
   input.focus({preventScroll:true});
   const scroll=()=>input.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"});
   requestAnimationFrame(scroll);
   setTimeout(scroll,150);
   setTimeout(scroll,400);
 }
 const historyPasswordInput=$("historyPassword");
 if(window.visualViewport&&historyPasswordInput){
   window.visualViewport.addEventListener("resize",()=>{
     const gate=$("historyGate");
     if(gate&&!gate.hidden&&document.activeElement===historyPasswordInput) setTimeout(()=>historyPasswordInput.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"}),50);
   });
 }
 function clearResults(){
   $("results").innerHTML="";
   $("historyGate").hidden=true;
   $("historyPassword").value="";
   $("historyStatus").textContent="";
   if(window.NEURON_StatisticsTrends && typeof window.NEURON_StatisticsTrends.clear==="function") window.NEURON_StatisticsTrends.clear();
 }
 [$("city"),$("period")].forEach(el=>el.addEventListener("change",clearResults));


 let activeRetrieval=null;
 let pendingNavigationHref=null;
 let pendingHistoryDirection=0;

 function setRetrievalStatus(message){
   $("retrievalStatus").textContent=message||"";
 }

 function setRetrievalControls(active){
   $("get").disabled=active;
   $("city").disabled=active;
   $("period").disabled=active;
 }

 const STATS_IDB_STORE="statisticsRetrieval";
 let statisticsPollTimer=null;

 function statisticsCriteriaKey_(city,period,showMode,selectedCities){
   const cities=(Array.isArray(selectedCities)?selectedCities:[]).map(x=>String(x).toLowerCase()).sort();
   return `STATS|${String(city||"").toLowerCase()}|${String(period||"").toLowerCase()}|${String(showMode||"both").toLowerCase()}|${cities.join(",")}`;
 }

 function statisticsStatusText_(status,city,period){
   const cityText=String(city||"All City Combined");
   let periodText=String(period||"");
   if(period==="today")periodText="Today";
   else if(period==="yesterday")periodText="Yesterday";
   else if(period==="daybefore")periodText="Day Before Yesterday";
   else if(/^\d{4}-\d{2}$/.test(period)){
     const [y,m]=period.split("-").map(Number);
     periodText=new Intl.DateTimeFormat("en-IN",{month:"short",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(y,m-1,1)));
   }
   const icon=status==="RUNNING"?"🔄":status==="COMPLETED"?"✓":"⚠";
   const label=status==="RUNNING"?"Running":status==="COMPLETED"?"Completed":"Failed";
   return `${icon} Statistics Retrieval ${label} — ${periodText} • ${cityText}`;
 }

 function setStatisticsTopStatus_(status,city,period){
   const el=$("statisticsRetrievalTopStatus");
   if(!el)return;
   if(!status){el.hidden=true;el.textContent="";el.className="statistics-retrieval-top-status";return;}
   el.hidden=false;
   el.className=`statistics-retrieval-top-status ${String(status).toLowerCase()}`;
   el.textContent=statisticsStatusText_(status,city,period);
 }

 async function saveStatisticsRetrievalState_(state, status, extra){
   const value={
     retrievalKey:state.retrievalKey,
     requestId:state.requestId||"",
     city:state.city||"",
     period:state.period||"",
     showMode:state.showMode||"both",
     selectedCities:Array.isArray(state.selectedCities)?state.selectedCities.slice():[],
     status:status,
     createdAt:Number(state.createdAt||Date.now()),
     updatedAt:Date.now()
   };
   Object.assign(value,extra||{});
   try{
     await IDB.put(STATS_IDB_STORE,value);
     if(["COMPLETED","FAILED"].includes(value.status)) await cleanupStatisticsRetrievals_();
   }catch(_){}
   setStatisticsTopStatus_(value.status,value.city,value.period);
   return value;
 }

 function statisticsRequest_(city,period,showMode,selectedCities){
   return {city:city,period:period,showMode:showMode,selectedCities:Array.isArray(selectedCities)?selectedCities.slice():[]};
 }

 async function applyStatisticsResult_(state,r){
   if(!r)return;
   let result=r;
   if(result.statisticsSourceCities==null && Array.isArray(state.selectedCities)) result.statisticsSourceCities=state.selectedCities.slice();
   if(result && result.trendData && Array.isArray(result.trendData.daily) && state.city!=="all")
     result.trendData=prepareScheduleAwareDailyTrend_(result.trendData,state.city,state.period);
   const relativeLabel=retrievalPeriodLabel(state.period);
   if(relativeLabel) result.periodLabel=relativeLabel;
   render(result);
   if(window.NEURON_StatisticsTrends) window.NEURON_StatisticsTrends.consume(result);
   await saveStatisticsRetrievalState_(state,"COMPLETED",{result:result,completedAt:Date.now()});
 }

 async function pollStatisticsRetrieval_(state){
   if(!state||!state.retrievalKey)return;
   if(statisticsPollTimer)clearTimeout(statisticsPollTimer);
   const poll=async()=>{
     if(!navigator.onLine){
       statisticsPollTimer=setTimeout(poll,3000);
       return;
     }
     try{
       const r=await NeuronAPI.call("getStatisticsRetrievalStatus",{retrievalKey:state.retrievalKey},10000);
       if(!r)return;
       if(activeRetrieval && activeRetrieval.retrievalKey && activeRetrieval.retrievalKey!==state.retrievalKey)return;
       if(r.status==="COMPLETED"&&r.result){
         await applyStatisticsResult_(state,r.result);
         return;
       }
       if(r.status!=="RUNNING"&&r.status!=="COMPLETED"){
         await saveStatisticsRetrievalState_(state,"FAILED",{error:r.error||"Statistics retrieval is no longer active."});
         $("results").innerHTML=`<div class="status">${U.esc(r.error||"Statistics retrieval failed.")}</div>`;
         return;
       }
       await saveStatisticsRetrievalState_(state,"RUNNING",{requestId:r.requestId||state.requestId});
       statisticsPollTimer=setTimeout(poll,3000);
     }catch(_){
       statisticsPollTimer=setTimeout(poll,3000);
     }
   };
   poll();
 }


 async function cleanupStatisticsRetrievals_(){
   try{
     const all=await IDB.all(STATS_IDB_STORE);
     const cutoff=Date.now()-5*60*1000;
     await Promise.all(all.filter(x=>x&&["COMPLETED","FAILED"].includes(x.status)&&Number(x.updatedAt||0)<cutoff)
       .map(x=>IDB.delete(STATS_IDB_STORE,x.retrievalKey)));
   }catch(_){}
 }

 async function restoreLatestStatisticsRetrieval_(){
   try{
     await cleanupStatisticsRetrievals_();
     const all=await IDB.all(STATS_IDB_STORE);
     if(!all.length)return;
     all.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0));
     const latest=all[0];
     const normalizedStatus=(latest.status==="RUNNING"||latest.status==="COMPLETED")?latest.status:"FAILED";
     setStatisticsTopStatus_(normalizedStatus,latest.city,latest.period);
     if(normalizedStatus==="RUNNING" && navigator.onLine){
       if(latest.period==="today" || hasHistoricalAccess()) await pollStatisticsRetrieval_(latest);
     }
   }catch(_){}
 }

 window.addEventListener("online",()=>{
   if(activeRetrieval) pollStatisticsRetrieval_(activeRetrieval);
 });

 function dailyDateKey_(period){
   const d=selectedDateForDailyPeriod_(period);
   if(!d)return "";
   return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}`;
 }
 function dailyDateLabel_(dateKey){
   const d=new Date(Date.UTC(Number(dateKey.slice(0,4)),Number(dateKey.slice(4,6))-1,Number(dateKey.slice(6,8))));
   return new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(d);
 }
 function buildStatisticsFromCache_(city,period,cities,patientsByCity){
   const rows=[];
   cities.forEach(c=>(patientsByCity[c]||[]).forEach(p=>rows.push({
     patientName:p?.name??p?.patientName??"",age:p?.age??"",ageUnit:p?.ageUnit??"",
     opdCharges:p?.opdCharges??0,opdCashPaid:Number(p?.opdCashPaid)||0,opdOnlinePaid:Number(p?.opdOnlinePaid)||0,opdTotalPaid:Number(p?.opdTotalPaid)||0,
     eegCharges:p?.eegCharges===""||p?.eegCharges==null?null:Number(p?.eegCharges),eegCashPaid:Number(p?.eegCashPaid)||0,eegOnlinePaid:Number(p?.eegOnlinePaid)||0,eegTotalPaid:Number(p?.eegTotalPaid)||0,
     mobileNumber:p?.whatsapp??p?.mobileNumber??"",opdRefund:p?.opdRefund??0,eegRefund:p?.eegRefund??0,date:p?.date??"",appointmentId:p?.appointmentId??"",city:c,
     followupCity:c==="Latur"?(p?.nextFollowupCity??p?.followupCity??""):""
   })));
   rows.sort((a,b)=>String(a.appointmentId||"").localeCompare(String(b.appointmentId||"")));
   const t={patientCount:0,freeOPD:0,eegCount:0,freeEEG:0,opdTotal:0,opdCash:0,opdOnline:0,opdPaid:0,opdRefund:0,eegTotal:0,eegCash:0,eegOnline:0,eegPaid:0,eegRefund:0,totalCash:0,totalOnline:0,totalCollection:0,totalRefund:0,netCash:0,netOnline:0,netTotal:0};
   const daily={};
   rows.forEach(x=>{
     const oc=Number(x.opdCharges)||0,or=Number(x.opdRefund)||0,ec=x.eegCharges==null?null:Number(x.eegCharges),er=Number(x.eegRefund)||0;
     t.patientCount++;t.opdTotal+=oc;t.opdCash+=Number(x.opdCashPaid)||0;t.opdOnline+=Number(x.opdOnlinePaid)||0;t.opdPaid+=Number(x.opdTotalPaid)||0;t.opdRefund+=or;
     if(oc===0||(oc>0&&or===oc))t.freeOPD++;
     if(ec!=null){t.eegCount++;t.eegTotal+=ec;t.eegCash+=Number(x.eegCashPaid)||0;t.eegOnline+=Number(x.eegOnlinePaid)||0;t.eegPaid+=Number(x.eegTotalPaid)||0;t.eegRefund+=er;if(ec===0||(ec>0&&er===ec))t.freeEEG++;}
     const k=String(x.date||"");if(/^\d{8}$/.test(k)){if(!daily[k])daily[k]={opd:0,eeg:0};daily[k].opd++;if(ec!=null)daily[k].eeg++;}
   });
   t.totalCash=t.opdCash+t.eegCash;t.totalOnline=t.opdOnline+t.eegOnline;t.totalCollection=t.opdPaid+t.eegPaid;t.totalRefund=t.opdRefund+t.eegRefund;t.netCash=t.totalCash-t.totalRefund;t.netOnline=t.totalOnline;t.netTotal=t.netCash+t.netOnline;
   return {ok:true,city:city,period:period,periodLabel:retrievalPeriodLabel(period),showMode:"both",hasDetail:true,rows:rows,totals:t,trendData:{daily:Object.keys(daily).sort().map(k=>({date:k,opd:daily[k].opd,eeg:daily[k].eeg}))},statisticsSourceCities:cities.slice()};
 }
 async function tryDailyCacheStatistics_(city,period,cities){
   if(!["today","yesterday","daybefore"].includes(period))return {handled:false};
   const dateKey=dailyDateKey_(period),targets=(Array.isArray(cities)&&cities.length?cities:[city]);
   const patientsByCity={},missing=[];
   const results=await Promise.all(targets.map(async c=>({city:c,cache:await IDB.getOPDTodayCache_(c,dateKey)})));
   results.forEach(({city:c,cache})=>{
     if(cache&&Array.isArray(cache.patients)&&cache.status!=="STALE"&&cache.status!=="CACHED_INCOMPLETE")patientsByCity[c]=cache.patients;
     else missing.push(c);
   });
   if(missing.length)return {handled:false,cacheMissing:true,missing,dateKey,cachedResult:buildStatisticsFromCache_(city,period,targets.filter(c=>!missing.includes(c)),patientsByCity)};
   return {handled:true,result:buildStatisticsFromCache_(city,period,targets,patientsByCity)};
 }

 function mergeStatisticsResults_(base,extra){
   if(!base)return extra;
   if(!extra)return base;
   const rows=[...(base.rows||[]),...(extra.rows||[])];
   const a=base.totals||{},b=extra.totals||{},sum=k=>(Number(a[k])||0)+(Number(b[k])||0);
   const totals={patientCount:sum("patientCount"),freeOPD:sum("freeOPD"),eegCount:sum("eegCount"),freeEEG:sum("freeEEG"),opdTotal:sum("opdTotal"),opdCash:sum("opdCash"),opdOnline:sum("opdOnline"),opdPaid:sum("opdPaid"),opdRefund:sum("opdRefund"),eegTotal:sum("eegTotal"),eegCash:sum("eegCash"),eegOnline:sum("eegOnline"),eegPaid:sum("eegPaid"),eegRefund:sum("eegRefund")};
   totals.totalCash=totals.opdCash+totals.eegCash;totals.totalOnline=totals.opdOnline+totals.eegOnline;totals.totalCollection=totals.opdPaid+totals.eegPaid;totals.totalRefund=totals.opdRefund+totals.eegRefund;totals.netCash=totals.totalCash-totals.totalRefund;totals.netOnline=totals.totalOnline;totals.netTotal=totals.netCash+totals.netOnline;
   const daily={};[...(base.trendData?.daily||[]),...(extra.trendData?.daily||[])].forEach(x=>{const k=String(x.date||"");if(!daily[k])daily[k]={opd:0,eeg:0};daily[k].opd+=Number(x.opd)||0;daily[k].eeg+=Number(x.eeg)||0;});
   return {...extra,city:"All",period:base.period,periodLabel:base.periodLabel,showMode:"both",hasDetail:true,rows,totals,trendData:{...(extra.trendData||{}),daily:Object.keys(daily).sort().map(k=>({date:k,opd:daily[k].opd,eeg:daily[k].eeg}))},statisticsSourceCities:[...(base.statisticsSourceCities||[]),...(extra.statisticsSourceCities||[])].filter((x,i,a)=>a.indexOf(x)===i)};
 }

 async function retrieveSelectedRecords(){
   const btn=$("get");
   const citySelect=$("city");
   const periodSelect=$("period");
   const old=btn.textContent;
   const selectedPeriod=periodSelect.value;
   let sourceCities=null;
   if(selectedPeriod==="today" || selectedPeriod==="yesterday" || selectedPeriod==="daybefore"){
     sourceCities=sourceCitiesForDailyPeriod_(selectedPeriod);
     if(citySelect.value!=="all" && !sourceCities.includes(citySelect.value)){
       const dateKey=dailyDateKey_(selectedPeriod);
       const message=`${U.esc(citySelect.value)} OPD was not scheduled on ${U.esc(dailyDateLabel_(dateKey))}.`;
       $("results").innerHTML=`<div class="status">${message}</div>`;
       setRetrievalStatus("Selected city/date is not scheduled.");
       return;
     }
     if(citySelect.value==="all" && !sourceCities.length){
       const dateKey=dailyDateKey_(selectedPeriod);
       $("results").innerHTML=`<div class="status">No OPD was scheduled on ${U.esc(dailyDateLabel_(dateKey))}.</div>`;
       setRetrievalStatus("No scheduled cities for the selected date.");
       return;
     }
   }
   let request=statisticsRequest_(citySelect.value,selectedPeriod,"both",sourceCities||[]);
   let retrievalKey=statisticsCriteriaKey_(request.city,request.period,request.showMode,request.selectedCities);
   setRetrievalControls(true);
   $("historyGate").hidden=true;
   btn.textContent="Retrieving Records…";
   $("results").innerHTML=`<div class="status">Checking schedule and OPD cache…</div>`;

   let cacheFallback=null;
   if(["today","yesterday","daybefore"].includes(selectedPeriod)){
     const cacheCheck=await tryDailyCacheStatistics_(request.city,selectedPeriod,sourceCities);
     if(cacheCheck.handled){
       const state={retrievalKey:retrievalKey,requestId:"",city:request.city,period:request.period,showMode:request.showMode,selectedCities:request.selectedCities,createdAt:Date.now(),updatedAt:Date.now()};
       activeRetrieval=state;
       await applyStatisticsResult_(state,cacheCheck.result);
       activeRetrieval=null;
       setRetrievalStatus("Statistics retrieved from OPD_TODAY cache.");
       setRetrievalControls(false);
       btn.textContent=old;
       return;
     }
     if(cacheCheck.cacheMissing){
       cacheFallback=cacheCheck;
       const missingText=cacheCheck.missing.map(U.esc).join(", ");
       $("results").innerHTML=`<div class="status">OPD cache is not available for ${missingText} on ${U.esc(dailyDateLabel_(cacheCheck.dateKey))}. Scanning Google Sheet, this may take some time…</div>`;
     }
   }
   if(cacheFallback && request.city==="all"){
     request=statisticsRequest_("all",selectedPeriod,"both",cacheFallback.missing);
     retrievalKey=statisticsCriteriaKey_(request.city,request.period,request.showMode,request.selectedCities);
   }

   try{
     const start=await NeuronAPI.call("startStatisticsRetrieval",request,10000);
     const state={
       retrievalKey:start.retrievalKey||retrievalKey,
       requestId:start.requestId||"",
       city:request.city,
       period:request.period,
       showMode:request.showMode,
       selectedCities:request.selectedCities,
       createdAt:Date.now(),
       updatedAt:Date.now()
     };
     activeRetrieval=state;
     await saveStatisticsRetrievalState_(state,start.status||"RUNNING",{reused:!!start.reused});

     if(start.status==="COMPLETED"&&start.result){
       await applyStatisticsResult_(state,start.result);
       return;
     }

     if(start.reused){
       $("results").innerHTML=`<div class="status">Reconnecting to the existing Statistics retrieval…</div>`;
       await pollStatisticsRetrieval_(state);
       return;
     }

     if(!cacheFallback){
       $("results").innerHTML=`<div class="status">${
         citySelect.value==="all"
           ? ((selectedPeriod==="today" || selectedPeriod==="yesterday" || selectedPeriod==="daybefore")
              ? "Determining city and retrieving records…"
              : "Retrieving records from all cities…")
           : "Retrieving records from Google Sheets…"
       }</div>`;
     }

     try{
       let r=await NeuronAPI.call("retrieveRecords",Object.assign({},request,{
         retrievalKey:state.retrievalKey,requestId:state.requestId
       }),30000);
       if(cacheFallback && request.city==="all")r=mergeStatisticsResults_(cacheFallback.cachedResult,r);
       await applyStatisticsResult_(state,r);
     }catch(e){
       const msg=String(e.message||e);
       if(msg.indexOf("Network timeout")!==-1){
         setRetrievalStatus("Retrieval timed out / connection lost. The backend retrieval is still being monitored.");
         $("results").innerHTML=`<div class="status">Connection lost. Statistics retrieval continues in the background. You can leave this page and reconnect later.</div>`;
       }else{
         setRetrievalStatus(msg);
         $("results").innerHTML=`<div class="status">${U.esc(msg)}</div>`;
       }
       if(msg.indexOf("Network timeout")!==-1 || !navigator.onLine) await pollStatisticsRetrieval_(state);
     }
   }catch(e){
     const msg=String(e.message||e);
     $("results").innerHTML=`<div class="status">${U.esc(msg)}</div>`;
     setRetrievalStatus("Unable to start or reconnect to Statistics retrieval. If the connection was interrupted, retrying the same criteria will reuse any server-side running retrieval.");
   }finally{
     setRetrievalControls(false);
     btn.textContent=old;
   }
 }

 let historicalVerifyPending=false;
 async function requestHistoricalAccess(){
   const input=$("historyPassword");
   const btn=$("historyUnlock");
   const status=$("historyStatus");
   btn.disabled=true;
   status.textContent="Verifying access…";
   try{
     const enteredHash=await sha256(input.value);
     if(enteredHash!==HISTORY_PASSWORD_HASH) throw Error("Incorrect historical statistics password.");
     localStorage.setItem(HISTORY_KEY,"1");
     input.value="";
     status.textContent="Historical access granted.";
     await retrieveSelectedRecords();
   }catch(e){
     status.textContent=e.message||"Unable to unlock historical statistics.";
   }finally{
     btn.disabled=false;
     historicalVerifyPending=false;
   }
 }

 $("historyPassword").addEventListener("input",()=>{
   const input=$("historyPassword");
   input.value=input.value.replace(/\D/g,"").slice(0,8);
   if(input.value.length===8 && !historicalVerifyPending){
     historicalVerifyPending=true;
     requestHistoricalAccess();
   }
 });
 $("historyPassword").addEventListener("focus",focusHistoricalAccess);
 $("get").onclick=async()=>{
   const selectedPeriod=$("period").value;
   if(selectedPeriod!=="today" && !hasHistoricalAccess()){
     $("results").innerHTML="";
     $("historyGate").hidden=false;
     $("historyStatus").textContent="";
     focusHistoricalAccess();
     return;
   }
   await retrieveSelectedRecords();
 };
 $("historyUnlock").onclick=requestHistoricalAccess;


 function money(n){return U.money(Number(n)||0)}
 function esc(v){return U.esc(v)}
 function render(r){
   const t=r.totals||{};
   const rows=r.rows||[];
   const hasDetail=!!r.hasDetail;
   const allCityDaily=(String(r.city||"").toLowerCase()==="all" && (r.period==="today" || r.period==="yesterday" || r.period==="daybefore"));
   const sourceCities=Array.isArray(r.statisticsSourceCities)
     ? r.statisticsSourceCities
     : (Array.isArray(r.statisticsScheduledCities)?r.statisticsScheduledCities:[]);
   const showDetail=hasDetail;
   const patientCount=Number(t.patientCount)||0;
   const freeOPD=Number(t.freeOPD)||0;
   const freeEEG=Number(t.freeEEG)||0;
   const totalRefundOPD=Number(t.opdRefund)||0;
   const totalRefundEEG=Number(t.eegRefund)||0;
   const totalRefund=Number(t.totalRefund)||(totalRefundOPD+totalRefundEEG);
   const totalCash=Number(t.totalCash)||(Number(t.opdCash)||0)+(Number(t.eegCash)||0);
   const totalOnline=Number(t.totalOnline)||(Number(t.opdOnline)||0)+(Number(t.eegOnline)||0);
   const totalCollection=Number(t.totalCollection)||(Number(t.opdPaid)||0)+(Number(t.eegPaid)||0);
   const netCash=Number(t.netCash)||(totalCash-totalRefund);
   const netOnline=Number(t.netOnline)||totalOnline;
   const netTotal=Number(t.netTotal)||(netCash+netOnline);
   let html=`<div class="report-head"><b>${esc(r.city)}</b> • ${esc(r.periodLabel||"")}</div>`;
   if(allCityDaily){
     html+=sourceCities.length
       ? `<div class="status" style="margin-top:8px">Data retrieved from: ${sourceCities.map(esc).join(" + ")}</div>`
       : `<div class="status" style="margin-top:8px">No scheduled visit for this date. No city data was retrieved.</div>`;
   }
   html+=`<div class="service-summary">
     <div class="service-card">
       <div class="service-card-title">OPD</div>
       <div class="service-card-body">
         <div class="service-metric"><span>Total</span><strong class="metric-total">${patientCount}</strong></div>
         <div class="service-divider"></div>
         <div class="service-metric"><span>Free</span><strong class="metric-free">${freeOPD}</strong></div>
       </div>
     </div>
     <div class="service-card">
       <div class="service-card-title">EEG</div>
       <div class="service-card-body">
         <div class="service-metric"><span>Total</span><strong class="metric-total">${Number(t.eegCount)||0}</strong></div>
         <div class="service-divider"></div>
         <div class="service-metric"><span>Free</span><strong class="metric-free">${freeEEG}</strong></div>
       </div>
     </div>
   </div>
   <div class="collection-card"><div class="collection-table-wrap"><table class="collection-table"><thead><tr><th></th><th>OPD</th><th>EEG</th><th>OPD+EEG</th><th>Net Total</th></tr></thead><tbody>
     <tr><th class="collection-label">Cash</th><td>${money(t.opdCash)}</td><td>${money(t.eegCash)}</td><td>${money(totalCash)}</td><td>${money(netCash)}</td></tr>
     <tr><th class="collection-label">Online</th><td>${money(t.opdOnline)}</td><td>${money(t.eegOnline)}</td><td>${money(totalOnline)}</td><td>${money(netOnline)}</td></tr>
     <tr><th class="collection-label">Refund</th><td>${money(totalRefundOPD)}</td><td>${money(totalRefundEEG)}</td><td>${money(totalRefund)}</td><td>${money(totalRefund)}</td></tr>
     <tr class="collection-total"><th class="collection-label">Total</th><td>${money(t.opdPaid)}</td><td>${money(t.eegPaid)}</td><td>${money(totalCollection)}</td><td>${money(netTotal)}</td></tr>
   </tbody></table></div></div>`;
   if(!patientCount){
     if(allCityDaily && sourceCities.length===0){
       $("results").innerHTML=html;
       return;
     }
     const city=esc(r.city||$("city").value);
     const dateLabel=["today","yesterday","daybefore"].includes(r.period)
       ? esc(dailyDateLabel_(dailyDateKey_(r.period)))
       : esc(r.periodLabel||$("period").selectedOptions[0]?.textContent||$("period").value);
     if(["today","yesterday","daybefore"].includes(r.period)){
       $("results").innerHTML=`<div class="status">No OPD records found for ${city} on ${dateLabel}.</div>`;
       return;
     }
     $("results").innerHTML=`<div class="status">No Record Available for ${city}, ${dateLabel}, Patient / EEG.</div>`;
     return;
   }
   if(showDetail){
     html+=bothTable(rows,t,String(r.city||"").toLowerCase()==="all");
     html+=`<div class="download-row" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:nowrap">
       <button id="downloadCsv" class="btn btn-secondary">⬇ Download CSV</button>
       <button id="downloadMobile" class="btn btn-secondary">⬇ Mobile Number</button>
     </div>`;
   }
   $("results").innerHTML=html;
   if(showDetail){
     $("downloadCsv").onclick=()=>downloadCSV(r);
     $("downloadMobile").onclick=()=>downloadMobileNumbers(r);
   }
 }

 function selectedPeriodForPatientTable(period){
   const q=U.parts();
   const currentMonth=`${q.y}-${String(q.m).padStart(2,"0")}`;
   return period==="today" || period==="yesterday" || period==="daybefore" || period===currentMonth;
 }

 function bothTable(rows,t,isAllCity){
   let html=`<div class="table-wrap combined-table-wrap"><table id="reportTable" class="combined-report"><thead>
     <tr><th rowspan="2">Sr. No.</th><th rowspan="2">Patient Name</th>${isAllCity?'<th rowspan="2">City</th>':''}<th colspan="4">OPD Collection</th><th colspan="4">EEG Collection</th><th rowspan="2">Mobile Number</th></tr>
     <tr><th>Cash</th><th>Online</th><th>Refund</th><th>Net Total</th><th>Cash</th><th>Online</th><th>Refund</th><th>Net Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>{
     const opdRefund=Number(x.opdRefund)||0;
     const eegRefund=Number(x.eegRefund)||0;
     const opdNet=(Number(x.opdCashPaid)||0)+(Number(x.opdOnlinePaid)||0)-opdRefund;
     const eegNet=(Number(x.eegCashPaid)||0)+(Number(x.eegOnlinePaid)||0)-eegRefund;
     html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td>${isAllCity?`<td>${esc(x.city)}</td>`:""}<td>${paidOrDash(x.opdCashPaid)}</td><td>${paidOrDash(x.opdOnlinePaid)}</td><td>${paidOrDash(opdRefund)}</td><td>${money(opdNet)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegCashPaid)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegOnlinePaid)}</td><td>${x.eegCharges===null?"-":paidOrDash(eegRefund)}</td><td>${x.eegCharges===null?"-":money(eegNet)}</td><td>${esc(x.mobileNumber)}</td></tr>`;
   });
   const opdCash=Number(t.opdCash)||0;
   const opdOnline=Number(t.opdOnline)||0;
   const opdRefund=Number(t.opdRefund)||0;
   const eegCash=Number(t.eegCash)||0;
   const eegOnline=Number(t.eegOnline)||0;
   const eegRefund=Number(t.eegRefund)||0;
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="${isAllCity?3:2}">Total</th><th>${money(opdCash)}</th><th>${money(opdOnline)}</th><th>${paidOrDash(opdRefund)}</th><th>${money(opdCash+opdOnline-opdRefund)}</th><th>${money(eegCash)}</th><th>${money(eegOnline)}</th><th>${paidOrDash(eegRefund)}</th><th>${money(eegCash+eegOnline-eegRefund)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }
 function paidOrDash(n){return Number(n)?money(n):"-";}

 function csvCell(v){
   const s=String(v==null?"":v);
   return `"${s.replace(/"/g,'""')}"`;
 }
 function downloadCSV(r){
   const rows=r.rows||[];
   const out=[];
   out.push([`${r.city} - ${r.periodLabel||r.period||""}`]);
   const isAllCity=String(r.city||"").toLowerCase()==="all";
   out.push(isAllCity
     ? ["Sr No.","Patient Name","City","OPD Cash","OPD Online","OPD Total","EEG Cash","EEG Online","EEG Total","Mobile Number"]
     : ["Sr No.","Patient Name","OPD Cash","OPD Online","OPD Total","EEG Cash","EEG Online","EEG Total","Mobile Number"]);
   rows.forEach((x,i)=>out.push(isAllCity
     ? [i+1,x.patientName,x.city,x.opdCashPaid,x.opdOnlinePaid,x.opdTotalPaid,x.eegCharges===null?"":x.eegCashPaid,x.eegCharges===null?"":x.eegOnlinePaid,x.eegCharges===null?"":x.eegTotalPaid,x.mobileNumber]
     : [i+1,x.patientName,x.opdCashPaid,x.opdOnlinePaid,x.opdTotalPaid,x.eegCharges===null?"":x.eegCashPaid,x.eegCharges===null?"":x.eegOnlinePaid,x.eegCharges===null?"":x.eegTotalPaid,x.mobileNumber]));
   const totalRow=["","TOTAL"];
   if(isAllCity)totalRow.push("");
   totalRow.push(
     rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.opdTotalPaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.eegTotalPaid)||0),0),"");
   out.push(totalRow);
   const csv="\uFEFF"+out.map(row=>row.map(csvCell).join(",")).join("\r\n");
   const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   const safeCity=String(r.city||"All").replace(/[^a-z0-9]+/gi,"_");
   const safePeriod=String(r.period||"report").replace(/[^a-z0-9-]+/gi,"_");
   a.href=url;a.download=`NEURON_${safeCity}_${safePeriod}_both.csv`;
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function downloadMobileNumbers(r){
   const rows=r.rows||[];
   const numbers=rows.map(x=>{
     const digits=String(x.mobileNumber??"").replace(/\D/g,"");
     if(/^91\d{10}$/.test(digits))return digits;
     if(/^0\d{10}$/.test(digits))return `91${digits.slice(1)}`;
     if(/^\d{10}$/.test(digits))return `91${digits}`;
     return "";
   }).filter(Boolean);
   const csv=numbers.join("\r\n");
   const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   const safeCity=String(r.city||"All").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"");
   const safePeriod=String(r.periodLabel||r.period||"report").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"");
   a.href=url;a.download=`NEURON_${safeCity||"All"}_${safePeriod||"report"}_Mobile_Numbers.csv`;
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

 restoreLatestStatisticsRetrieval_();
});

// v199.6: Responsive Statistics Performance Trends. The loaded Statistics
// response is the only data source; no additional retrieval is performed.
(function initPerformanceTrends_(){
 const $=U.$;
 const section=$("performanceTrends"),body=$("performanceBody"),toggle=$("performanceToggle");
 const periodEl=$("trendPeriod"),chartEl=$("trendChart"),summaryEl=$("trendSummary"),statusEl=$("trendStatus"),rangeEl=$("trendRange");
 if(!section||!body||!toggle||!periodEl||!chartEl||!summaryEl||!statusEl||!rangeEl)return;
 let latestResponse=null,loadedStatisticsPeriod=null,popupTimer=null;
 const fmt=n=>Number.isInteger(n)?String(n):Number(n).toFixed(1).replace(/\.0$/,'');
 const esc=v=>U.esc(v);
 function setStatus(s){statusEl.textContent=s||"";}
 function monthLabel(key){
   const [y,m]=String(key).split("-").map(Number); if(!y||!m)return String(key);
   return new Intl.DateTimeFormat("en-IN",{month:"short",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(y,m-1,1)));
 }
 function dateLabel(key){const s=String(key);return /^\d{8}$/.test(s)?s.slice(6,8):s;}
 function individualYearForPeriod_(period){
   const q=U.parts();
   if(/^\d{4}$/.test(String(period||"")))return Number(period);
   if(period==="currentyear")return q.y;
   if(period==="lastyear")return q.y-1;
   return null;
 }
 function yearLabel(y){return String(y)+(Number(y)===U.parts().y?" *":"");}
 function stats(vals){
   if(!vals.length)return null;
   const sum=vals.reduce((a,b)=>a+b,0);
   return {min:Math.min(...vals),mean:sum/vals.length,max:Math.max(...vals)};
 }
 function niceScale_(values){
   const max=Math.max(0,...values.map(v=>Number(v)||0));
   if(max<=0)return {max:1,step:1};
   const raw=max/4,pow=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/pow;
   const nice=n<=1?1:n<=2?2:n<=5?5:10,step=nice*pow;
   return {max:Math.max(step,Math.ceil(max/step)*step),step};
 }
 function displayedPoints_(choice,td){
   const q=U.parts(),endMonth=q.y*12+(q.m-1);
   if(choice==="currentMonth"){
     if(!Array.isArray(td.daily))return {points:[],type:"daily",message:"Daily trend data is not available in the loaded Statistics response."};
     const prefix=`${q.y}${String(q.m).padStart(2,"0")}`;
     return {points:td.daily.filter(p=>String(p.date||"").startsWith(prefix)),type:"daily"};
   }
   if(choice==="selectedMonth"){
     if(!Array.isArray(td.daily))return {points:[],type:"daily",message:"Daily trend data is not available in the loaded Statistics response."};
     return {points:td.daily.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))),type:"daily"};
   }
   if(choice==="last6"||choice==="last12"){
     if(!Array.isArray(td.monthly))return {points:[],type:"month",message:"Monthly trend data is not available in the loaded Statistics response."};
     const count=choice==="last6"?6:12,start=endMonth-(count-1);
     return {points:td.monthly.filter(p=>{const a=String(p.month||"").split("-").map(Number);if(a.length!==2||!a[0]||!a[1])return false;const idx=a[0]*12+(a[1]-1);return idx>=start&&idx<=endMonth;}),type:"month"};
   }
   if(choice==="selectedYear"){
     if(!Array.isArray(td.monthly))return {points:[],type:"month",message:"Monthly trend data is not available in the loaded Statistics response."};
     const year=individualYearForPeriod_(loadedStatisticsPeriod);
     if(!year)return {points:[],type:"month",message:"Selected year is not available in the loaded Statistics response."};
     const byMonth=new Map(td.monthly.filter(p=>String(p.month||"").startsWith(`${year}-`)).map(p=>[String(p.month),p]));
     const points=[];
     for(let m=1;m<=12;m++){
       const key=`${year}-${String(m).padStart(2,"0")}`,p=byMonth.get(key);
       points.push({month:key,opd:p?Number(p.opd)||0:0,eeg:p?Number(p.eeg)||0:0});
     }
     return {points,type:"month"};
   }
   if(choice==="last5"){
     if(!Array.isArray(td.yearly))return {points:[],type:"year",message:"Yearly trend data is not available in the loaded Statistics response."};
     return {points:td.yearly.slice().sort((a,b)=>Number(a.year)-Number(b.year)),type:"year"};
   }
   return {points:[],type:"year"};
 }
 function availableTrendOptions_(period,td){
   const q=U.parts(),opts=[],add=(value,label)=>opts.push({value,label});
   if(/^\d{4}-\d{2}$/.test(period)){
     const [y,m]=period.split("-").map(Number);
     add("selectedMonth",new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(y,m-1,1))));
     return opts;
   }
   if(/^\d{4}$/.test(period) || period==="currentyear" || period==="lastyear"){
     const year=individualYearForPeriod_(period);
     add("selectedYear",String(year));
     return opts;
   }
   if(Array.isArray(td.daily))add("currentMonth","Current Month");
   if(Array.isArray(td.monthly)){add("last6","Last 6 Months");add("last12","Last 12 Months");}
   if(Array.isArray(td.yearly)){
     add("currentYear",`Current Year (${q.y})`);add("lastYear",`Last Year (${q.y-1})`);
     for(let i=2;i<=5;i++)add(`year:${q.y-i}`,`${i} Years Ago (${q.y-i})`);
     add("last5","Last 5 Years");
   }
   if(period==="last5")return opts;
   if(period==="last12")return opts.filter(x=>["currentMonth","last6","last12"].includes(x.value));
   if(period==="currentyear" || period==="lastyear")return opts;
   return [];
 }
 function syncTrendOptions_(){
   if(!latestResponse||!latestResponse.trendData){periodEl.innerHTML="";return;}
   const opts=availableTrendOptions_(loadedStatisticsPeriod,latestResponse.trendData),current=periodEl.value;
   const isIndividualYear=individualYearForPeriod_(loadedStatisticsPeriod)!==null;
   const controls=periodEl.closest(".performance-controls");
   if(controls)controls.hidden=isIndividualYear;
   periodEl.innerHTML=opts.map(o=>`<option value="${o.value}">${o.label}</option>`).join("");
   if(opts.some(o=>o.value===current))periodEl.value=current;else if(opts.length)periodEl.value=opts[0].value;
 }
 function clearPopup_(){
   if(popupTimer)clearTimeout(popupTimer);popupTimer=null;
   const old=chartEl.querySelectorAll(".trend-point-popup");old.forEach(x=>x.remove());
 }
 function showPopup_(svg,x,y,title,label,value){
   clearPopup_();
   const ns="http://www.w3.org/2000/svg",g=document.createElementNS(ns,"g");g.setAttribute("class","trend-point-popup");
   const W=900,boxW=176,boxH=44,left=Math.max(8,Math.min(W-boxW-8,x-boxW/2)),top=Math.max(8,y-boxH-12);
   const rect=document.createElementNS(ns,"rect");rect.setAttribute("x",String(left));rect.setAttribute("y",String(top));rect.setAttribute("width",String(boxW));rect.setAttribute("height",String(boxH));rect.setAttribute("rx","8");rect.setAttribute("class","trend-popup-box");
   const t1=document.createElementNS(ns,"text");t1.setAttribute("x",String(left+10));t1.setAttribute("y",String(top+17));t1.setAttribute("class","trend-popup-title");t1.textContent=title;
   const t2=document.createElementNS(ns,"text");t2.setAttribute("x",String(left+10));t2.setAttribute("y",String(top+35));t2.setAttribute("class","trend-popup-value");t2.textContent=`${label}: ${fmt(value)}`;
   g.append(rect,t1,t2);svg.appendChild(g);
   popupTimer=setTimeout(clearPopup_,1200);
 }
 function graphDimensions_(n){
   const W=900,H=360,L=56,R=18,T=34,B=n>16?64:54;return {W,H,L,R,T,B,cw:W-L-R,ch:H-T-B};
 }
 function graphShell_(title,svg,metric,subtitle){
   return `<div class="trend-panel ${metric.toLowerCase()}"><div class="trend-panel-head"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div><div class="trend-svg-wrap">${svg}</div></div>`;
 }
 function lineChart_(points,metric,title){
   const key=metric,vals=points.map(p=>Number(p[key])||0),sc=niceScale_(vals),max=sc.max,n=points.length,d=graphDimensions_(n),{W,H,L,R,T,B,cw,ch}=d;
   const x=i=>n<=1?L+cw/2:L+(i/(n-1))*cw,y=v=>T+ch-(v/max)*ch;
   let g="";
   for(let v=0;v<=max;v+=sc.step){const yy=y(v);g+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" class="trend-gridline"/><text x="${L-9}" y="${yy+4}" text-anchor="end" class="trend-axis-label">${fmt(v)}</text>`;}
   const every=Math.max(1,Math.ceil(n/10));
   points.forEach((p,i)=>{if(i%every===0||i===n-1){const label=p.date;g+=`<text x="${x(i)}" y="${H-20}" text-anchor="middle" class="trend-axis-label">${esc(dateLabel(label))}</text>`;}});
   const path=points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(Number(p[key])||0).toFixed(1)}`).join(" ");
   g+=`<path d="${path}" class="trend-line ${metric.toLowerCase()}" data-chart-line="1"/>`;
   points.forEach((p,i)=>{const px=x(i),py=y(Number(p[key])||0),label=dateLabel(p.date);g+=`<circle cx="${px}" cy="${py}" r="7" class="trend-hit ${metric.toLowerCase()}" data-index="${i}" tabindex="0" aria-label="${esc(label)} ${metric.toUpperCase()} ${fmt(Number(p[key])||0)}"/>`;});
   const svg=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="trend-svg" role="img" aria-label="${esc(title)}">${g}</svg>`;
   const html=graphShell_(title,svg,metric,`${n} available day${n===1?"":"s"}`);
   return {html,bind(svgData){}};
 }
 function barChart_(points,metric,type,title){
   const key=metric,vals=points.map(p=>Number(p[key])||0),sc=niceScale_(vals),max=sc.max,n=points.length,d=graphDimensions_(n),{W,H,L,R,T,B,cw,ch}=d;
   const groupW=cw/Math.max(1,n),barW=Math.min(58,Math.max(12,groupW*.68)),x0=i=>L+i*groupW+groupW/2,y=v=>T+ch-(v/max)*ch;
   let g="";
   for(let v=0;v<=max;v+=sc.step){const yy=y(v);g+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" class="trend-gridline"/><text x="${L-9}" y="${yy+4}" text-anchor="end" class="trend-axis-label">${fmt(v)}</text>`;}
   const every=type==="year"?Math.max(1,Math.ceil(n/12)):1;
   points.forEach((p,i)=>{const center=x0(i),labelText=type==="year"?yearLabel(p.year):monthLabel(p.month);if(i%every===0||i===n-1){const ty=H-B+18;g+=`<text x="${center}" y="${ty}" text-anchor="start" transform="rotate(90 ${center} ${ty})" class="trend-axis-label">${esc(labelText)}</text>`;}const v=Number(p[key])||0;g+=`<rect x="${center-barW/2}" y="${y(v)}" width="${barW}" height="${Math.max(0,T+ch-y(v))}" rx="4" class="trend-bar ${metric.toLowerCase()}" data-index="${i}" tabindex="0"/>`;});
   const svg=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="trend-svg" role="img" aria-label="${esc(title)}">${g}</svg>`;
   return {html:graphShell_(title,svg,metric,`${n} period${n===1?"":"s"}`)};
 }
 function buildPanel_(points,metric,type){
   const title=metric==="opd"?(type==="daily"?"OPD — Daily Activity":type==="month"?"OPD — Monthly Activity":"OPD — Yearly Activity"):(type==="daily"?"EEG — Daily Activity":type==="month"?"EEG — Monthly Activity":"EEG — Yearly Activity");
   return type==="daily"?lineChart_(points,metric,title):barChart_(points,metric,type,title);
 }
 function summary_(points,metric,type){
   const key=metric,st=stats(points.map(p=>Number(p[key])||0));if(!st)return "";
   const total=points.reduce((a,p)=>a+(Number(p[key])||0),0),avg=points.length?total/points.length:0;
   const daily=type==="daily";
   return `<div class="trend-summary-card ${key}"><div class="trend-summary-title">${key==="opd"?"OPD":"EEG"}</div><div class="trend-summary-grid">${daily?`<div><small>Available days</small><strong>${points.length}</strong></div>`:""}<div><small>Total</small><strong>${fmt(total)}</strong></div><div><small>${daily?"Average / day":"Average"}</small><strong>${fmt(avg)}</strong></div><div><small>Min</small><strong>${fmt(st.min)}</strong></div><div><small>Mean</small><strong>${fmt(st.mean)}</strong></div><div><small>Max</small><strong>${fmt(st.max)}</strong></div></div></div>`;
 }
 function rangeText_(res,choice,city){
   if(choice==="selectedMonth"){const [y,m]=loadedStatisticsPeriod.split("-").map(Number);return `${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(y,m-1,1)))} • ${esc(city)}`;}
   if(choice==="selectedYear")return `${loadedStatisticsPeriod} • ${esc(city)}`;
   if(res.type==="daily"){const q=U.parts();return `${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(q.y,q.m-1,1)))} • ${esc(city)}`;}
   return `${res.points.length} displayed ${res.type==="month"?"month":"year"}${res.points.length===1?"":"s"} • ${esc(city)}`;
 }
 function bindGraphClicks_(){
   const activate=(el,idx,e)=>{
     e.stopPropagation();
     const panel=el.closest(".trend-panel"),svg=el.closest("svg");
     if(!panel||!svg||!Number.isInteger(idx))return;
     const metric=panel.classList.contains("eeg")?"eeg":"opd",choice=periodEl.value,res=displayedPoints_(choice,latestResponse.trendData),p=res.points[idx];
     if(!p)return;
     const title=res.type==="daily"?dateLabel(p.date):res.type==="month"?monthLabel(p.month):yearLabel(p.year);
     const box=el.getBBox();showPopup_(svg,box.x+box.width/2,box.y,title,metric.toUpperCase(),Number(p[metric])||0);
   };
   chartEl.querySelectorAll(".trend-hit,.trend-bar").forEach(el=>{
     const handler=e=>activate(el,Number(el.getAttribute("data-index")),e);
     el.addEventListener("click",handler);el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();handler(e);}});
   });
   chartEl.querySelectorAll(".trend-line[data-chart-line='1']").forEach(line=>line.addEventListener("click",e=>{
     e.stopPropagation();
     const svg=line.closest("svg"),panel=line.closest(".trend-panel");if(!svg||!panel)return;
     const rect=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,n=displayedPoints_(periodEl.value,latestResponse.trendData).points.length;
     if(!n)return;
     const localX=(e.clientX-rect.left)*(vb.width/rect.width),L=56,R=18,cw=vb.width-L-R;
     const idx=n<=1?0:Math.max(0,Math.min(n-1,Math.round((localX-L)/cw*(n-1))));
     const hit=panel.querySelector(`.trend-hit[data-index="${idx}"]`);if(hit)activate(hit,idx,e);
   }));
   chartEl.addEventListener("click",e=>{if(!e.target.closest(".trend-hit,.trend-bar,.trend-line"))clearPopup_();});
 }
 function renderTrend_(){
   clearPopup_();
   if(!latestResponse||!latestResponse.trendData){section.hidden=true;return;}
   const city=String($("city").value||"all");
   if(city.toLowerCase()==="all"){section.hidden=true;return;}
   if(["today","yesterday","daybefore"].includes(loadedStatisticsPeriod)){section.hidden=true;return;}
   syncTrendOptions_();
   const choice=periodEl.value,td=latestResponse.trendData,res=displayedPoints_(choice,td);
   if(res.message){setStatus(res.message);chartEl.innerHTML="";summaryEl.innerHTML="";rangeEl.textContent="";return;}
   if(!res.points.length){setStatus("No trend data available for this selection.");chartEl.innerHTML='<div class="trend-empty">No trend data available for this selection.</div>';summaryEl.innerHTML="";rangeEl.textContent="";return;}
   setStatus(res.type==="daily"?"Daily data includes only doctor-available dates; available zero-activity days are shown as zero.":res.type==="month"?"Monthly totals are actual recorded totals.":"Yearly totals are actual recorded totals; current year is partial through today and is marked with *.");
   const opd=buildPanel_(res.points,"opd",res.type),eeg=buildPanel_(res.points,"eeg",res.type);
   chartEl.innerHTML=opd.html+eeg.html;
   summaryEl.innerHTML=summary_(res.points,"opd",res.type)+summary_(res.points,"eeg",res.type);
   rangeEl.textContent=rangeText_(res,choice,city);
   bindGraphClicks_();
 }
 window.NEURON_StatisticsTrends={
   consume:function(r){latestResponse=r||null;loadedStatisticsPeriod=String($("period").value||"");syncTrendOptions_();section.hidden=["today","yesterday","daybefore"].includes(loadedStatisticsPeriod);section.classList.add("is-collapsed");toggle.setAttribute("aria-expanded","false");toggle.textContent="Show";renderTrend_();},
   clear:function(){clearPopup_();latestResponse=null;loadedStatisticsPeriod=null;section.hidden=true;section.classList.add("is-collapsed");toggle.setAttribute("aria-expanded","false");toggle.textContent="Show";periodEl.innerHTML="";chartEl.innerHTML="";summaryEl.innerHTML="";rangeEl.textContent="";setStatus("");}
 };
 toggle.onclick=()=>{const collapsed=section.classList.toggle("is-collapsed");toggle.setAttribute("aria-expanded",String(!collapsed));toggle.textContent=collapsed?"Show":"Hide";if(!collapsed)renderTrend_();};
 periodEl.onchange=renderTrend_;
})();
