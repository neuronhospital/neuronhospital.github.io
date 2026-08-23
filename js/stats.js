document.addEventListener("DOMContentLoaded",()=>{
 const $=U.$;
 const cities=NEURON_CONFIG.cities||[];
 const scheduledCity=window.Schedule?.cityAtNow?Schedule.cityAtNow(cities):"Latur";
 $("city").innerHTML=cities.map(x=>`<option value="${U.esc(x)}">${U.esc(x)}</option>`).join("");
 if(cities.includes(scheduledCity)) $("city").value=scheduledCity;

 const q=U.parts(),cur=`${q.y}-${String(q.m).padStart(2,"0")}`;
 $("period").innerHTML=
   `<option value="today">Today</option>
    <option value="yesterday">Yesterday</option>
    <option value="daybefore">Day Before Yesterday</option>
    <option value="${cur}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(q.y,q.m-1,1))}</option>
    <option value="last12">Last 12 Months</option>
    <option value="currentyear">${q.y}</option>
    <option value="lastyear">${q.y-1}</option>`;
 $("show").value="both";

 let lastReport=null;

 function clearResults(){
   lastReport=null;
   $("results").innerHTML="";
 }
 [$('city'),$('period'),$('show')].forEach(el=>el.addEventListener("change",clearResults));

 $("get").onclick=async()=>{
   const btn=$("get");
   const old=btn.textContent;
   btn.disabled=true;
   btn.textContent="Retrieving Records…";
   $("results").innerHTML=`<div class="status">Retrieving records from Google Sheets…</div>`;
   try{
     let tok=localStorage.getItem("neuron_retrieval_token")||"";
     if(!tok){
       throw Error("Statistics access session is missing. Please return to Statistics and enter the password again.");
     }
     const r=await NeuronAPI.call("retrieveRecords",{
       token:tok,
       city:$("city").value,
       period:$("period").value,
       showMode:$("show").value
     },25000);
     lastReport=r;
     render(r,"CURRENT");
   }catch(e){
     const msg=String(e.message||e);
     $("results").innerHTML=`<div class="status">${U.esc(msg)}</div>`;
   }finally{
     btn.disabled=false;
     btn.textContent=old;
   }
 };

 function money(n){return U.money(Number(n)||0)}
 function esc(v){return U.esc(v)}
 function rowsFor(mode,rows){
   if(mode==="eeg")return rows.filter(x=>x.eegCharges!==null);
   return rows;
 }
 function collectionTotal(x,key){
   return (Number(x[`${key}CashPaid`])||0)+(Number(x[`${key}OnlinePaid`])||0);
 }
 function safeTotal(x,key){
   const value=Number(x[`${key}TotalPaid`]);
   return Number.isFinite(value)?value:collectionTotal(x,key);
 }

 function render(r,state){
   const t=r.totals||{};
   const mode=r.showMode||$("show").value;
   const rows=rowsFor(mode,r.rows||[]);
   let html=`<div class="report-head"><b>${esc(r.city)}</b> • ${esc(r.periodLabel||"")}`;
   html+=` <span class="data-state ${state==="CURRENT"?"data-current":"data-cached"}">${state==="CURRENT"?"Current":"Cached"}</span></div>`;

   if(mode==="patient"){
     const free=(r.rows||[]).filter(x=>Number(x.opdCharges)===0).length;
     html+=`<div class="summary-grid">
       <div class="stat"><small>Total OPD</small><strong>${r.rows.length}</strong></div>
       <div class="stat"><small>Free OPD</small><strong>${free}</strong></div>
       <div class="stat"><small>Total OPD Collection</small><strong>${money(t.opdTotal)}</strong></div>
       <div class="stat"><small>Cash</small><strong>${money(t.opdCash)}</strong></div>
       <div class="stat"><small>Online</small><strong>${money(t.opdOnline)}</strong></div>
     </div>`;
     html+=patientTable(rows);
   }else if(mode==="eeg"){
     const free=(r.rows||[]).filter(x=>Number(x.eegCharges)===0).length;
     html+=`<div class="summary-grid">
       <div class="stat"><small>Total EEG</small><strong>${r.rows.length}</strong></div>
       <div class="stat"><small>Free EEG</small><strong>${free}</strong></div>
       <div class="stat"><small>Total EEG Charges</small><strong>${money(t.eegTotal)}</strong></div>
       <div class="stat"><small>Cash</small><strong>${money(t.eegCash)}</strong></div>
       <div class="stat"><small>Online</small><strong>${money(t.eegOnline)}</strong></div>
     </div>`;
     html+=eegTable(rows);
   }else{
     const freeOPD=(r.rows||[]).filter(x=>Number(x.opdCharges)===0).length;
     const eegRows=(r.rows||[]).filter(x=>x.eegCharges!==null);
     const freeEEG=eegRows.filter(x=>Number(x.eegCharges)===0).length;
     const totalCash=(Number(t.opdCash)||0)+(Number(t.eegCash)||0);
     const totalOnline=(Number(t.opdOnline)||0)+(Number(t.eegOnline)||0);
     const totalCollection=(Number(t.opdTotal)||0)+(Number(t.eegTotal)||0);
     html+=bothSummary({
       opdTotal:r.rows.length,
       opdFree:freeOPD,
       eegTotal:t.eegCount||eegRows.length,
       eegFree:freeEEG,
       opdCash:t.opdCash,
       opdOnline:t.opdOnline,
       opdCollection:t.opdTotal,
       eegCash:t.eegCash,
       eegOnline:t.eegOnline,
       eegCollection:t.eegTotal,
       combinedCash:totalCash,
       combinedOnline:totalOnline,
       combinedCollection:totalCollection
     });
     html+=bothTable(rows);
   }
   if(!rows.length){
     const city=esc(r.city||$("city").value);
     const dateLabel=esc(r.periodLabel||$("period").selectedOptions[0]?.textContent||$("period").value);
     const modeLabel=mode==="patient"?"Patient":mode==="eeg"?"EEG":"Patient / EEG";
     $("results").innerHTML=`<div class="status">No Record Available for ${city}, ${dateLabel}, ${modeLabel}.</div>`;
     return;
   }
   html+=`<div class="download-row" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:nowrap">
     <button id="downloadCsv" class="btn btn-secondary">⬇ Download CSV</button>
     <button id="downloadMobile" class="btn btn-secondary">⬇ Mobile Number</button>
   </div>`;
   $("results").innerHTML=html;
   $("downloadCsv").onclick=()=>downloadCSV(r,mode);
   $("downloadMobile").onclick=()=>downloadMobileNumbers(r,mode);
 }

 function bothSummary(s){
   return `<div class="table-wrap"><table>
     <thead><tr><th></th><th>OPD</th><th>EEG</th></tr></thead>
     <tbody>
       <tr><th>Total</th><td>${s.opdTotal}</td><td>${s.eegTotal}</td></tr>
       <tr><th>Free</th><td>${s.opdFree}</td><td>${s.eegFree}</td></tr>
     </tbody>
   </table></div>
   <div class="table-wrap" style="margin-top:12px"><table>
     <thead><tr><th></th><th>OPD</th><th>EEG</th><th>OPD+EEG</th></tr></thead>
     <tbody>
       <tr><th>Cash</th><td>${money(s.opdCash)}</td><td>${money(s.eegCash)}</td><td>${money(s.combinedCash)}</td></tr>
       <tr><th>Online</th><td>${money(s.opdOnline)}</td><td>${money(s.eegOnline)}</td><td>${money(s.combinedOnline)}</td></tr>
       <tr class="total-row"><th>Total</th><td>${money(s.opdCollection)}</td><td>${money(s.eegCollection)}</td><td>${money(s.combinedCollection)}</td></tr>
     </tbody>
   </table></div>`;
 }

 function patientTable(rows){
   let html=`<div class="table-wrap"><table id="reportTable" style="table-layout:fixed;min-width:640px"><colgroup><col style="width:60px"><col style="width:180px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:120px"></colgroup><thead>
     <tr><th>Cash</th><th>Online</th><th>Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>{
     const opdTotal=safeTotal(x,"opd");
     html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${money(x.opdCashPaid)}</td><td>${money(x.opdOnlinePaid)}</td><td>${money(opdTotal)}</td><td>${esc(x.mobileNumber)}</td></tr>`;
   });
   const cash=rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0);
   const online=rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0);
   const total=rows.reduce((a,x)=>a+safeTotal(x,"opd"),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(cash)}</th><th>${money(online)}</th><th>${money(total)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }

 function eegTable(rows){
   let html=`<div class="table-wrap"><table id="reportTable" style="table-layout:fixed;min-width:640px"><colgroup><col style="width:60px"><col style="width:180px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:120px"></colgroup><thead>
     <tr><th>Cash</th><th>Online</th><th>Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>{
     const eegTotal=safeTotal(x,"eeg");
     html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${money(x.eegCashPaid)}</td><td>${money(x.eegOnlinePaid)}</td><td>${money(eegTotal)}</td><td>${esc(x.mobileNumber)}</td></tr>`;
   });
   const cash=rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0);
   const online=rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0);
   const total=rows.reduce((a,x)=>a+safeTotal(x,"eeg"),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(cash)}</th><th>${money(online)}</th><th>${money(total)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }

 function bothTable(rows){
   let html=`<div class="table-wrap"><table id="reportTable" style="table-layout:fixed;min-width:910px"><colgroup><col style="width:60px"><col style="width:180px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:120px"></colgroup><thead>
     <tr><th>Cash</th><th>Online</th><th>Total</th><th>Cash</th><th>Online</th><th>Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>{
     const opdTotal=safeTotal(x,"opd");
     const eegTotal=x.eegCharges===null?null:safeTotal(x,"eeg");
     html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${money(x.opdCashPaid)}</td><td>${money(x.opdOnlinePaid)}</td><td>${money(opdTotal)}</td><td>${x.eegCharges===null?"—":money(x.eegCashPaid)}</td><td>${x.eegCharges===null?"—":money(x.eegOnlinePaid)}</td><td>${eegTotal===null?"—":money(eegTotal)}</td><td>${esc(x.mobileNumber)}</td></tr>`;
   });
   const opdCash=rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0);
   const opdOnline=rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0);
   const opdTotal=rows.reduce((a,x)=>a+safeTotal(x,"opd"),0);
   const eegCash=rows.reduce((a,x)=>a+(x.eegCharges===null?0:Number(x.eegCashPaid)||0),0);
   const eegOnline=rows.reduce((a,x)=>a+(x.eegCharges===null?0:Number(x.eegOnlinePaid)||0),0);
   const eegTotal=rows.reduce((a,x)=>a+(x.eegCharges===null?0:safeTotal(x,"eeg")),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(opdCash)}</th><th>${money(opdOnline)}</th><th>${money(opdTotal)}</th><th>${money(eegCash)}</th><th>${money(eegOnline)}</th><th>${money(eegTotal)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }

 function csvCell(v){
   const s=String(v==null?"":v);
   return `"${s.replace(/"/g,'""')}"`;
 }
 function downloadCSV(r,mode){
   const rows=rowsFor(mode,r.rows||[]);
   const out=[];
   out.push([`${r.city} - ${r.periodLabel||r.period||""}`]);
   if(mode==="patient"){
     out.push(["Sr No.","Patient Name","OPD Charges","Cash","Online","Mobile Number"]);
     rows.forEach((x,i)=>out.push([i+1,x.patientName,x.opdCharges,x.opdCashPaid,x.opdOnlinePaid,x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.opdCharges)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),""]);
   }else if(mode==="eeg"){
     out.push(["Sr No.","Patient Name","EEG Charges","Cash","Online","Mobile Number"]);
     rows.forEach((x,i)=>out.push([i+1,x.patientName,x.eegCharges,x.eegCashPaid,x.eegOnlinePaid,x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.eegCharges)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0),""]);
   }else{
     out.push(["Sr No.","Patient Name","OPD Cash","OPD Online","OPD Total","EEG Cash","EEG Online","EEG Total","Mobile Number"]);
     rows.forEach((x,i)=>out.push([i+1,x.patientName,x.opdCashPaid,x.opdOnlinePaid,safeTotal(x,"opd"),x.eegCharges===null?"":x.eegCashPaid,x.eegCharges===null?"":x.eegOnlinePaid,x.eegCharges===null?"":safeTotal(x,"eeg"),x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),
       rows.reduce((a,x)=>a+safeTotal(x,"opd"),0),
       rows.reduce((a,x)=>a+(x.eegCharges===null?0:Number(x.eegCashPaid)||0),0),
       rows.reduce((a,x)=>a+(x.eegCharges===null?0:Number(x.eegOnlinePaid)||0),0),
       rows.reduce((a,x)=>a+(x.eegCharges===null?0:safeTotal(x,"eeg")),0),""]);
   }
   const csv="\uFEFF"+out.map(row=>row.map(csvCell).join(",")).join("\r\n");
   const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   const safeCity=String(r.city||"All").replace(/[^a-z0-9]+/gi,"_");
   const safePeriod=String(r.period||"report").replace(/[^a-z0-9-]+/gi,"_");
   a.href=url;a.download=`NEURON_${safeCity}_${safePeriod}_${mode}.csv`;
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function downloadMobileNumbers(r,mode){
   const rows=rowsFor(mode,r.rows||[]);
   const out=[["Mobile Number"]];
   rows.forEach(x=>out.push([x.mobileNumber]));
   const csv="\uFEFF"+out.map(row=>row.map(csvCell).join(",")).join("\r\n");
   const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   const safeCity=String(r.city||"All").replace(/[^a-z0-9]+/gi,"_");
   const safePeriod=String(r.period||"report").replace(/[^a-z0-9-]+/gi,"_");
   a.href=url;a.download=`NEURON_${safeCity}_${safePeriod}_${mode}_Mobile_Numbers.csv`;
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 
});
