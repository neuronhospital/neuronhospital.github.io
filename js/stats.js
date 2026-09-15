document.addEventListener("DOMContentLoaded",()=>{
 const $=U.$;
 $("city").innerHTML=
   `<option value="all">All City Combined</option>`+
   NEURON_CONFIG.cities.map(x=>`<option value="${U.esc(x)}">${U.esc(x)}</option>`).join("");
 if(window.Schedule&&typeof Schedule.cityAtNow==="function"){
   const scheduledCity=Schedule.cityAtNow(NEURON_CONFIG.cities);
   if(NEURON_CONFIG.cities.includes(scheduledCity)) $("city").value=scheduledCity;
 }
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
    <option value="currentyear">${q.y}</option>
    <option value="lastyear">${q.y-1}</option>`;

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
 }
 [$("city"),$("period")].forEach(el=>el.addEventListener("change",clearResults));


 let activeRetrieval=null;
 let navigationGuardActive=false;
 let navigationGuardState=null;
 let pendingNavigationHref=null;
 let pendingHistoryDirection=0;

 function setRetrievalStatus(message){
   $("retrievalStatus").textContent=message||"";
 }

 function setRetrievalControls(active){
   $("cancelRetrieval").hidden=!active;
   $("get").disabled=active;
   $("city").disabled=active;
   $("period").disabled=active;
 }

 async function cancelActiveRetrieval_(navigateAfter){
   const active=activeRetrieval;
   if(!active||active.cancelling)return false;
   active.cancelling=true;
   $("cancelRetrieval").disabled=true;
   setRetrievalStatus("Cancelling retrieval…");
   try{
     const r=await NeuronAPI.call("cancelStatisticsRetrieval",{requestId:active.requestId},10000);
     if(!r||!r.cancelled)throw Error("Cancellation was not confirmed by the server.");
     try{active.controller.abort();}catch(_){}
     setRetrievalStatus("Retrieval cancelled successfully.");
     if(navigateAfter){
       const href=pendingNavigationHref;
       const direction=pendingHistoryDirection;
       navigationGuardActive=false;
       navigationGuardState=null;
       pendingNavigationHref=null;
       pendingHistoryDirection=0;
       if(href){
         location.href=href;
       }else if(direction!==0){
         history.go(direction);
       }
     }
     return true;
   }catch(e){
     active.cancelling=false;
     $("cancelRetrieval").disabled=false;
     setRetrievalStatus(e.message||"Unable to cancel retrieval.");
     return false;
   }
 }

 function installNavigationGuard_(){
   if(navigationGuardActive)return;
   navigationGuardActive=true;
   navigationGuardState={neuronStatisticsGuard:true,token:Date.now()};
   history.pushState(navigationGuardState,"",location.href);
 }

 function showNavigationDialog_(){
   if(document.getElementById("statsNavigationDialog"))return;
   const wrap=document.createElement("div");
   wrap.id="statsNavigationDialog";
   wrap.innerHTML=`<div class="stats-nav-backdrop"></div><div class="stats-nav-dialog" role="dialog" aria-modal="true" aria-labelledby="stats-nav-title"><div id="stats-nav-title">Retrieval in progress</div><p>A Statistics retrieval is still running. Cancel it before leaving this page?</p><div class="stats-nav-actions"><button type="button" class="btn btn-secondary" data-stay>Stay on Page</button><button type="button" class="btn btn-primary" data-cancel-nav>Cancel Retrieval &amp; Navigate</button></div></div>`;
   document.body.appendChild(wrap);
   wrap.querySelector("[data-stay]").onclick=()=>{
     pendingNavigationHref=null;
     pendingHistoryDirection=0;
     wrap.remove();
   };
   wrap.querySelector("[data-cancel-nav]").onclick=async()=>{
     const btn=wrap.querySelector("[data-cancel-nav]");
     btn.disabled=true;
     const ok=await cancelActiveRetrieval_(true);
     if(ok)wrap.remove(); else btn.disabled=false;
   };
 }

 window.addEventListener("popstate",event=>{
   if(!activeRetrieval||activeRetrieval.cancelling)return;
   if(navigationGuardActive){
     pendingHistoryDirection=(event.state===navigationGuardState)?1:-1;
     history.pushState(navigationGuardState,"",location.href);
     showNavigationDialog_();
   }
 });

 document.addEventListener("click",e=>{
   const link=e.target.closest("a[href]");
   if(!link||!activeRetrieval||activeRetrieval.cancelling)return;
   const href=link.getAttribute("href")||"";
   if(!href||href.startsWith("#")||href.startsWith("tel:")||href.startsWith("mailto:"))return;
   if(new URL(link.href,location.href).origin!==location.origin)return;
   e.preventDefault();
   pendingNavigationHref=link.href;
   pendingHistoryDirection=0;
   showNavigationDialog_();
 });

 async function retrieveSelectedRecords(){
   const btn=$("get");
   const citySelect=$("city");
   const periodSelect=$("period");
   const old=btn.textContent;
   const selectedPeriod=periodSelect.value;
   const requestId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"stats-"+Date.now()+"-"+Math.random().toString(36).slice(2);
   const controller=new AbortController();
   activeRetrieval={requestId:requestId,controller:controller,cancelling:false};
   installNavigationGuard_();
   setRetrievalControls(true);
   $("historyGate").hidden=true;
   btn.textContent="Retrieving Records…";
   setRetrievalStatus("");
   $("results").innerHTML=`<div class="status">${
     citySelect.value==="all"
       ? "Retrieving records from all cities…"
       : "Retrieving records from Google Sheets…"
   }</div>`;
   try{
     const r=await NeuronAPI.call("retrieveRecords",{
       city:citySelect.value,
       period:selectedPeriod,
       showMode:"both",
       requestId:requestId
     },120000,{signal:controller.signal});
     if(r&&r.cancelled){
       setRetrievalStatus("Retrieval cancelled successfully.");
       return;
     }
     const relativeLabel=retrievalPeriodLabel(selectedPeriod);
     if(relativeLabel) r.periodLabel=relativeLabel;
     render(r);
   }catch(e){
     if(activeRetrieval&&activeRetrieval.requestId===requestId&&activeRetrieval.cancelling){
       return;
     }
     const msg=String(e.message||e);
     if(msg.indexOf("Network timeout")!==-1){
       setRetrievalStatus("Retrieval timed out. Cancelling the backend retrieval…");
       const ok=await cancelActiveRetrieval_(false);
       if(ok)$("results").innerHTML="";
       else $("results").innerHTML=`<div class="status">${U.esc(msg)}</div>`;
     }else if(msg==="Request cancelled."){
       setRetrievalStatus("Retrieval cancelled successfully.");
     }else{
       $("results").innerHTML=`<div class="status">${U.esc(msg)}</div>`;
     }
   }finally{
     if(activeRetrieval&&activeRetrieval.requestId===requestId){
       activeRetrieval=null;
       if(navigationGuardActive){
         history.replaceState(null,"",location.href);
       }
       navigationGuardActive=false;
       navigationGuardState=null;
       pendingNavigationHref=null;
       pendingHistoryDirection=0;
       setRetrievalControls(false);
       btn.textContent=old;
     }
   }
 }

 $("cancelRetrieval").onclick=()=>cancelActiveRetrieval_(false);

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
     const city=esc(r.city||$("city").value);
     const dateLabel=esc(r.periodLabel||$("period").selectedOptions[0]?.textContent||$("period").value);
     $("results").innerHTML=`<div class="status">No Record Available for ${city}, ${dateLabel}, Patient / EEG.</div>`;
     return;
   }
   if(hasDetail){
     html+=bothTable(rows,t);
     html+=`<div class="download-row" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:nowrap">
       <button id="downloadCsv" class="btn btn-secondary">⬇ Download CSV</button>
       <button id="downloadMobile" class="btn btn-secondary">⬇ Mobile Number</button>
     </div>`;
   }
   $("results").innerHTML=html;
   if(hasDetail){
     $("downloadCsv").onclick=()=>downloadCSV(r);
     $("downloadMobile").onclick=()=>downloadMobileNumbers(r);
   }
 }

 function selectedPeriodForPatientTable(period){
   const q=U.parts();
   const currentMonth=`${q.y}-${String(q.m).padStart(2,"0")}`;
   return period==="today" || period==="yesterday" || period==="daybefore" || period===currentMonth;
 }

 function bothTable(rows,t){
   let html=`<div class="table-wrap combined-table-wrap"><table id="reportTable" class="combined-report"><thead>
     <tr><th rowspan="2">Sr. No.</th><th rowspan="2">Patient Name</th><th colspan="4">OPD Collection</th><th colspan="4">EEG Collection</th><th rowspan="2">Mobile Number</th></tr>
     <tr><th>Cash</th><th>Online</th><th>Refund</th><th>Net Total</th><th>Cash</th><th>Online</th><th>Refund</th><th>Net Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>{
     const opdRefund=Number(x.opdRefund)||0;
     const eegRefund=Number(x.eegRefund)||0;
     const opdNet=(Number(x.opdCashPaid)||0)+(Number(x.opdOnlinePaid)||0)-opdRefund;
     const eegNet=(Number(x.eegCashPaid)||0)+(Number(x.eegOnlinePaid)||0)-eegRefund;
     html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${paidOrDash(x.opdCashPaid)}</td><td>${paidOrDash(x.opdOnlinePaid)}</td><td>${paidOrDash(opdRefund)}</td><td>${money(opdNet)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegCashPaid)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegOnlinePaid)}</td><td>${x.eegCharges===null?"-":paidOrDash(eegRefund)}</td><td>${x.eegCharges===null?"-":money(eegNet)}</td><td>${esc(x.mobileNumber)}</td></tr>`;
   });
   const opdCash=Number(t.opdCash)||0;
   const opdOnline=Number(t.opdOnline)||0;
   const opdRefund=Number(t.opdRefund)||0;
   const eegCash=Number(t.eegCash)||0;
   const eegOnline=Number(t.eegOnline)||0;
   const eegRefund=Number(t.eegRefund)||0;
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(opdCash)}</th><th>${money(opdOnline)}</th><th>${paidOrDash(opdRefund)}</th><th>${money(opdCash+opdOnline-opdRefund)}</th><th>${money(eegCash)}</th><th>${money(eegOnline)}</th><th>${paidOrDash(eegRefund)}</th><th>${money(eegCash+eegOnline-eegRefund)}</th><th>—</th></tr></tfoot></table></div>`;
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
   out.push(["Sr No.","Patient Name","OPD Cash","OPD Online","OPD Total","EEG Cash","EEG Online","EEG Total","Mobile Number"]);
   rows.forEach((x,i)=>out.push([i+1,x.patientName,x.opdCashPaid,x.opdOnlinePaid,x.opdTotalPaid,x.eegCharges===null?"":x.eegCashPaid,x.eegCharges===null?"":x.eegOnlinePaid,x.eegCharges===null?"":x.eegTotalPaid,x.mobileNumber]));
   out.push(["","TOTAL",
     rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.opdTotalPaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0),
     rows.reduce((a,x)=>a+(Number(x.eegTotalPaid)||0),0),""]);
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
   const out=[["Mobile Number"]];
   rows.forEach(x=>out.push([x.mobileNumber]));
   const csv="\uFEFF"+out.map(row=>row.map(csvCell).join(",")).join("\r\n");
   const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   const safeCity=String(r.city||"All").replace(/[^a-z0-9]+/gi,"_");
   const safePeriod=String(r.period||"report").replace(/[^a-z0-9-]+/gi,"_");
   a.href=url;a.download=`NEURON_${safeCity}_${safePeriod}_both_Mobile_Numbers.csv`;
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }

});
