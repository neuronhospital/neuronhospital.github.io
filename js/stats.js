document.addEventListener("DOMContentLoaded",()=>{
 const $=U.$;
 $("city").innerHTML=NEURON_CONFIG.cities.map(x=>`<option>${x}</option>`).join("");
 if(window.Schedule&&typeof Schedule.cityAtNow==="function"){
   const scheduledCity=Schedule.cityAtNow(NEURON_CONFIG.cities);
   if(NEURON_CONFIG.cities.includes(scheduledCity)) $("city").value=scheduledCity;
 }
 const q=U.parts(),cur=`${q.y}-${String(q.m).padStart(2,"0")}`;
 $("period").innerHTML=
   `<option value="today">Today</option>
    <option value="yesterday">Yesterday</option>
    <option value="daybefore">Day Before Yesterday</option>
    <option value="${cur}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(q.y,q.m-1,1))}</option>
    <option value="last12">Last 12 Months</option>
    <option value="currentyear">${q.y}</option>
    <option value="lastyear">${q.y-1}</option>`;

 let lastReport=null;

 function clearResults(){
   lastReport=null;
   $("results").innerHTML="";
 }
 [$("city"),$("period")].forEach(el=>el.addEventListener("change",clearResults));


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
       showMode:"both"
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

 function render(r,state){
   const t=r.totals||{};
   const mode="both";
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
     const totalCollection=(Number(t.opdPaid)||0)+(Number(t.eegPaid)||0);
     html+=`<div class="summary-grid service-summary">
       <div class="stat service-stat"><small></small><strong>OPD</strong></div>
       <div class="stat service-stat"><small></small><strong>EEG</strong></div>
       <div class="stat service-stat"><small>Total</small><strong>${r.rows.length}</strong></div>
       <div class="stat service-stat"><small>Total</small><strong>${t.eegCount||eegRows.length}</strong></div>
       <div class="stat service-stat"><small>Free</small><strong>${freeOPD}</strong></div>
       <div class="stat service-stat"><small>Free</small><strong>${freeEEG}</strong></div>
     </div>
     <div class="collection-card">
       <div class="collection-grid collection-head"><div></div><div>OPD</div><div>EEG</div><div>OPD+EEG</div></div>
       <div class="collection-grid"><div class="collection-label">Cash</div><div>${money(t.opdCash)}</div><div>${money(t.eegCash)}</div><div>${money(totalCash)}</div></div>
       <div class="collection-grid"><div class="collection-label">Online</div><div>${money(t.opdOnline)}</div><div>${money(t.eegOnline)}</div><div>${money(totalOnline)}</div></div>
       <div class="collection-grid collection-total"><div class="collection-label">Total</div><div>${money(t.opdPaid)}</div><div>${money(t.eegPaid)}</div><div>${money(totalCollection)}</div></div>
     </div>`;
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

 function patientTable(rows){
   let html=`<div class="table-wrap"><table id="reportTable"><thead><tr>
     <th>Sr No.</th><th>Patient Name</th><th>OPD Charges</th><th>Cash</th><th>Online</th><th>Mobile Number</th>
   </tr></thead><tbody>`;
   rows.forEach((x,i)=>html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${money(x.opdCharges)}</td><td>${money(x.opdCashPaid)}</td><td>${money(x.opdOnlinePaid)}</td><td>${esc(x.mobileNumber)}</td></tr>`);
   const total=rows.reduce((a,x)=>a+(Number(x.opdCharges)||0),0);
   const cash=rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0);
   const online=rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(total)}</th><th>${money(cash)}</th><th>${money(online)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }

 function eegTable(rows){
   let html=`<div class="table-wrap"><table id="reportTable"><thead><tr>
     <th>Sr No.</th><th>Patient Name</th><th>EEG Charges</th><th>Cash</th><th>Online</th><th>Mobile Number</th>
   </tr></thead><tbody>`;
   rows.forEach((x,i)=>html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${money(x.eegCharges)}</td><td>${money(x.eegCashPaid)}</td><td>${money(x.eegOnlinePaid)}</td><td>${esc(x.mobileNumber)}</td></tr>`);
   const total=rows.reduce((a,x)=>a+(Number(x.eegCharges)||0),0);
   const cash=rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0);
   const online=rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(total)}</th><th>${money(cash)}</th><th>${money(online)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }

 function bothTable(rows){
   let html=`<div class="table-wrap combined-table-wrap"><table id="reportTable" class="combined-report"><thead>
     <tr><th rowspan="2">Sr. No.</th><th rowspan="2">Patient Name</th><th colspan="3">OPD Collection</th><th colspan="3">EEG Collection</th><th rowspan="2">Mobile Number</th></tr>
     <tr><th>Cash</th><th>Online</th><th>Total</th><th>Cash</th><th>Online</th><th>Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${paidOrDash(x.opdCashPaid)}</td><td>${paidOrDash(x.opdOnlinePaid)}</td><td>${money(x.opdCharges)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegCashPaid)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegOnlinePaid)}</td><td>${x.eegCharges===null?"—":money(x.eegCharges)}</td><td>${esc(x.mobileNumber)}</td></tr>`);
   const opd=rows.reduce((a,x)=>a+(Number(x.opdTotalPaid)||0),0);
   const opdCash=rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0);
   const opdOnline=rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0);
   const eeg=rows.reduce((a,x)=>a+(Number(x.eegTotalPaid)||0),0);
   const eegCash=rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0);
   const eegOnline=rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(opdCash)}</th><th>${money(opdOnline)}</th><th>${money(opd)}</th><th>${money(eegCash)}</th><th>${money(eegOnline)}</th><th>${money(eeg)}</th><th>—</th></tr></tfoot></table></div>`;
   return html;
 }
 function paidOrDash(n){return Number(n)?money(n):"-";}

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
     rows.forEach((x,i)=>out.push([i+1,x.patientName,x.opdCashPaid,x.opdOnlinePaid,x.opdTotalPaid,x.eegCharges===null?"":x.eegCashPaid,x.eegCharges===null?"":x.eegOnlinePaid,x.eegCharges===null?"":x.eegTotalPaid,x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdTotalPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegTotalPaid)||0),0),""]);
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
