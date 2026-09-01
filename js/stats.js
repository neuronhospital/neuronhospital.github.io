function statDisplayValue_(v){
  return (v===0 || v==="0" || v===null || v===undefined || v==="") ? "-" : v;
}
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
    <option value="${cur}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(q.y,q.m-1,1))}</option>
    <option value="${(()=>{const d=new Date(q.y,q.m-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`})()}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(q.y,q.m-2,1))}</option>
    <option value="${(()=>{const d=new Date(q.y,q.m-3,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`})()}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(q.y,q.m-3,1))}</option>
    <option value="${(()=>{const d=new Date(q.y,q.m-4,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`})()}">${new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(new Date(q.y,q.m-4,1))}</option>
    <option value="last12">Last 12 Months</option>
    <option value="currentyear">${q.y}</option>
    <option value="lastyear">${q.y-1}</option>`;

 let lastReport=null;

 function retrievalPeriodLabel(period){
   const now=new Date();
   const base=new Date(now.getFullYear(),now.getMonth(),now.getDate());
   let offset=null, prefix="";
   if(period==="today"){offset=0;prefix="Today";}
   else if(period==="yesterday"){offset=1;prefix="Yesterday";}
   else if(period==="daybefore"){offset=2;prefix="Day before Yesterday";}
   if(offset===null)return null;
   const d=new Date(base);
   d.setDate(d.getDate()-offset);
   const dateText=new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(d);
   return `${prefix} (${dateText})`;
 }

 function clearResults(){
   lastReport=null;
   $("results").innerHTML="";
 }
 [$("city"),$("period")].forEach(el=>el.addEventListener("change",clearResults));


 $("get").onclick=async()=>{
   const btn=$("get");
   const citySelect=$("city");
   const periodSelect=$("period");
   const old=btn.textContent;
   const selectedPeriod=periodSelect.value;
   btn.disabled=true;
   citySelect.disabled=true;
   periodSelect.disabled=true;
   btn.textContent="Retrieving Records…";
   $("results").innerHTML=`<div class="status">Retrieving records from Google Sheets…</div>`;
   try{
     const r=await NeuronAPI.call("retrieveRecords",{
       city:citySelect.value,
       period:selectedPeriod,
       showMode:"both"
     },25000);
     if(citySelect.value==="all") r.city="All City Combined";
     const relativeLabel=retrievalPeriodLabel(selectedPeriod);
     if(relativeLabel) r.periodLabel=relativeLabel;
     lastReport=r;
     render(r,"CURRENT");
   }catch(e){
     const msg=String(e.message||e);
     $("results").innerHTML=`<div class="status">${U.esc(msg)}</div>`;
   }finally{
     btn.disabled=false;
     citySelect.disabled=false;
     periodSelect.disabled=false;
     btn.textContent=old;
   }
 };

 function money(n){const v=Number(n)||0; return v===0?"-":U.money(v)}
 function esc(v){return U.esc(v)}
 function rowsFor(mode,rows){
   if(mode==="eeg")return rows.filter(x=>x.eegCharges!==null);
   return rows;
 }

 function render(r,state){
   const t=r.totals||{};
   const mode="both";
   const rows=rowsFor(mode,r.rows||[]);
   let html=`<div class="report-head"><b>${esc(r.city)}</b> • ${esc(r.periodLabel||"")}</div>`;

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
     const totalRefundOPD=rows.reduce((a,x)=>a+(Number(x.opdRefund)||0),0);
     const totalRefundEEG=rows.reduce((a,x)=>a+(Number(x.eegRefund)||0),0);
     const totalRefund=totalRefundOPD+totalRefundEEG;
     const totalCash=(Number(t.opdCash)||0)+(Number(t.eegCash)||0);
     const totalOnline=(Number(t.opdOnline)||0)+(Number(t.eegOnline)||0);
     const totalCollection=(Number(t.opdPaid)||0)+(Number(t.eegPaid)||0);
     const netCash=totalCash-totalRefund;
     const netOnline=totalOnline;
     const netTotal=netCash+netOnline;
     html+=`<div class="summary-grid service-summary">
       <div class="stat service-stat"><small></small><strong>OPD</strong></div>
       <div class="stat service-stat"><small></small><strong>EEG</strong></div>
       <div class="stat service-stat"><small>Total</small><strong>${r.rows.length}</strong></div>
       <div class="stat service-stat"><small>Total</small><strong>${t.eegCount||eegRows.length}</strong></div>
       <div class="stat service-stat"><small>Free</small><strong>${freeOPD}</strong></div>
       <div class="stat service-stat"><small>Free</small><strong>${freeEEG}</strong></div>
     </div>
     <div class="collection-card">
       <div class="collection-grid collection-head"><div></div><div>OPD</div><div>EEG</div><div>OPD+EEG</div><div>Net Total</div></div>
       <div class="collection-grid"><div class="collection-label">Cash</div><div>${money(t.opdCash)}</div><div>${money(t.eegCash)}</div><div>${money(totalCash)}</div><div>${money(netCash)}</div></div>
       <div class="collection-grid"><div class="collection-label">Online</div><div>${money(t.opdOnline)}</div><div>${money(t.eegOnline)}</div><div>${money(totalOnline)}</div><div>${money(netOnline)}</div></div>
       <div class="collection-grid"><div class="collection-label">Refund</div><div>${money(totalRefundOPD)}</div><div>${money(totalRefundEEG)}</div><div>${money(totalRefund)}</div><div>${money(totalRefund)}</div></div>
       <div class="collection-grid collection-total"><div class="collection-label">Total</div><div>${money(t.opdPaid)}</div><div>${money(t.eegPaid)}</div><div>${money(totalCollection)}</div><div>${money(netTotal)}</div></div>
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
     <tr><th rowspan="2">Sr. No.</th><th rowspan="2">Patient Name</th><th colspan="4">OPD Collection</th><th colspan="4">EEG Collection</th><th rowspan="2">Mobile Number</th></tr>
     <tr><th>Cash</th><th>Online</th><th>Refund</th><th>Net Total</th><th>Cash</th><th>Online</th><th>Refund</th><th>Net Total</th></tr>
   </thead><tbody>`;
   rows.forEach((x,i)=>{
     const opdRefund=Number(x.opdRefund)||0;
     const eegRefund=Number(x.eegRefund)||0;
     const opdNet=(Number(x.opdCashPaid)||0)+(Number(x.opdOnlinePaid)||0)-opdRefund;
     const eegNet=(Number(x.eegCashPaid)||0)+(Number(x.eegOnlinePaid)||0)-eegRefund;
     html+=`<tr><td>${i+1}</td><td>${esc(x.patientName)}</td><td>${paidOrDash(x.opdCashPaid)}</td><td>${paidOrDash(x.opdOnlinePaid)}</td><td>${money(opdRefund)}</td><td>${money(opdNet)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegCashPaid)}</td><td>${x.eegCharges===null?"-":paidOrDash(x.eegOnlinePaid)}</td><td>${x.eegCharges===null?"-":money(eegRefund)}</td><td>${x.eegCharges===null?"-":money(eegNet)}</td><td>${esc(x.mobileNumber)}</td></tr>`;
   });
   const opd=rows.reduce((a,x)=>a+(Number(x.opdTotalPaid)||0),0);
   const opdCash=rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0);
   const opdOnline=rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0);
   const opdRefund=rows.reduce((a,x)=>a+(Number(x.opdRefund)||0),0);
   const eeg=rows.reduce((a,x)=>a+(Number(x.eegTotalPaid)||0),0);
   const eegCash=rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0);
   const eegOnline=rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0);
   const eegRefund=rows.reduce((a,x)=>a+(Number(x.eegRefund)||0),0);
   html+=`</tbody><tfoot><tr class="total-row"><th colspan="2">Total</th><th>${money(opdCash)}</th><th>${money(opdOnline)}</th><th>${money(opdRefund)}</th><th>${money(opdCash+opdOnline-opdRefund)}</th><th>${money(eegCash)}</th><th>${money(eegOnline)}</th><th>${money(eegRefund)}</th><th>${money(eegCash+eegOnline-eegRefund)}</th><th>—</th></tr></tfoot></table></div>`;
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
     rows.forEach((x,i)=>out.push([i+1,x.patientName,x.opdCharges,statDisplayValue_(x.opdCashPaid),statDisplayValue_(x.opdOnlinePaid),x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.opdCharges)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),""]);
   }else if(mode==="eeg"){
     out.push(["Sr No.","Patient Name","EEG Charges","Cash","Online","Mobile Number"]);
     rows.forEach((x,i)=>out.push([i+1,x.patientName,x.eegCharges,statDisplayValue_(x.eegCashPaid),statDisplayValue_(x.eegOnlinePaid),x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.eegCharges)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0),""]);
   }else{
     out.push(["Sr No.","Patient Name","OPD Cash","OPD Online","OPD Total","EEG Cash","EEG Online","EEG Total","Mobile Number"]);
     rows.forEach((x,i)=>out.push([i+1,x.patientName,statDisplayValue_(x.opdCashPaid),statDisplayValue_(x.opdOnlinePaid),statDisplayValue_(x.opdTotalPaid),x.eegCharges===null?"":statDisplayValue_(x.eegCashPaid),x.eegCharges===null?"":statDisplayValue_(x.eegOnlinePaid),x.eegCharges===null?"":statDisplayValue_(x.eegTotalPaid),x.mobileNumber]));
     out.push(["","TOTAL",
       rows.reduce((a,x)=>a+(Number(x.opdCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdOnlinePaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.opdTotalPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegCashPaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegOnlinePaid)||0),0),
       rows.reduce((a,x)=>a+(Number(x.eegTotalPaid)||0),0),""]);
   }
   const csv="\uFEFF"+out.map(row=>row.map(csvCell).join(",")).join("\r
");
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
   const csv="\uFEFF"+out.map(row=>row.map(csvCell).join(",")).join("\r
");
   const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const a=document.createElement("a");
   const safeCity=String(r.city||"All").replace(/[^a-z0-9]+/gi,"_");
   const safePeriod=String(r.period||"report").replace(/[^a-z0-9-]+/gi,"_");
   a.href=url;a.download=`NEURON_${safeCity}_${safePeriod}_${mode}_Mobile_Numbers.csv`;
   document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 
});
