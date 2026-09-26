const EEG_CALLS_ACCESS_KEY="neuron_eeg_calls_access";
const EEG_CALLS_UPDATE_PASSWORD_HASH="7931486c46d8a4d07e683f1dfa62296fe5ffe494746c59b02a5540a1f1423390";
let eegCallsUpdateState={months:[],selected:null,busy:false,originMonthKey:"",cache:null};
const EEG_CALLS_CACHE_KEY="eegCallsRawCacheV1";
const EEG_CALLS_CACHE_MONTHS=4;
function eegCallsUpdateNow_(){return Date.now();}
function eegCallsUpdateMonthKey_(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit"}).formatToParts(new Date());const y=parts.find(x=>x.type==="year")?.value||"";const m=parts.find(x=>x.type==="month")?.value||"";return `${y}-${m}`;}
function eegCallsUpdateMonthKeys_(){const [y,m]=eegCallsUpdateMonthKey_().split("-").map(Number);const keys=[];for(let i=0;i<EEG_CALLS_CACHE_MONTHS;i++){const d=new Date(Date.UTC(y,m-1-i,1));keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`);}return keys;}
function eegCallsUpdateTrimRecords_(records){const keys=new Set(eegCallsUpdateMonthKeys_().map(k=>k.replace("-","")));return (Array.isArray(records)?records:[]).filter(r=>keys.has(String(r?.dateKey||"").substring(0,6)));}
function eegCallsUpdateFormatTimestamp_(value){if(!value)return "-";try{return new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}catch(_){return String(value);}}
async function eegCallsUpdateGetCache_(){return await IDB.get("cache",EEG_CALLS_CACHE_KEY);}
async function eegCallsUpdateSaveCache_(cache){await IDB.put("cache",{...cache,key:EEG_CALLS_CACHE_KEY});eegCallsUpdateState.cache=cache;}
function eegCallsUpdateBuildMonths_(records){const source=eegCallsUpdateTrimRecords_(records);const keys=eegCallsUpdateMonthKeys_();return keys.map((key,offset)=>{const compact=key.replace("-","");const patients=eegCallsUpdateSortPatients_(source.filter(r=>String(r?.dateKey||"").substring(0,6)===compact));const d=new Date(`${key}-01T00:00:00Z`);return {key,label:new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",month:"long",year:"numeric"}).format(d),totalCalls:patients.length,collection:patients.reduce((t,r)=>t+(Number(r.paymentReceived)||0),0),editable:offset===0,patients};});}
function eegCallsUpdateRenderCacheStatus_(message=""){const box=document.getElementById("cacheStatus");if(!box)return;const c=eegCallsUpdateState.cache;const stale=window.IDB?.cacheStale_?.(c,c?.records,"appointmentId")===true;const warning=stale?"⚠ This list is not up to date. Please Update.":"";box.innerHTML=`<div><b>Last Data Updated:</b> ${eegCallsUpdateEsc_(eegCallsUpdateFormatTimestamp_(c?.lastDataUpdatedAt))}</div><div><b>Checked At:</b> ${eegCallsUpdateEsc_(eegCallsUpdateFormatTimestamp_(c?.lastServerCheckAt||c?.lastCheckedAt))}</div>${warning?`<div style="margin-top:6px">${eegCallsUpdateEsc_(warning)}</div>`:""}${message?`<div style="margin-top:6px">${eegCallsUpdateEsc_(message)}</div>`:""}`;box.hidden=false;}

async function eegCallsUpdateSha256_(message){
  const data=new TextEncoder().encode(message);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function eegCallsUpdateShow_(id,visible){const el=document.getElementById(id);if(el)el.hidden=!visible;}
function eegCallsUpdateEsc_(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function eegCallsUpdateMoney_(n){return "₹"+(Number(n)||0).toLocaleString("en-IN");}
function eegCallsUpdateTotalMoney_(n){return "₹ "+String(Math.round(Number(n)||0).toLocaleString("en-IN")).replace(/,/g,"");}
function eegCallsUpdateFormatDate_(date){
  const s=String(date||"");
  if(/^\d{8}$/.test(s))return `${s.substring(6,8)}/${s.substring(4,6)}/${s.substring(0,4)}`;
  return String(date||"");
}
function eegCallsUpdateSortPatients_(patients){
  return [...(Array.isArray(patients)?patients:[])].sort((a,b)=>{
    const ad=String(a?.dateKey||"")+String(a?.time||"");
    const bd=String(b?.dateKey||"")+String(b?.time||"");
    if(ad!==bd)return bd.localeCompare(ad);
    const ar=Number(a?.rowNumber)||0;
    const br=Number(b?.rowNumber)||0;
    return ar-br;
  });
}
function eegCallsUpdatePatientHtml_(p,editable){
  const name=eegCallsUpdateEsc_(p.patientName);
  if(editable)return `<button type="button" class="eeg-call-patient-link" data-row="${Number(p.rowNumber)||0}">${name}</button>`;
  return `<span class="eeg-call-patient-name">${name}</span>`;
}
function eegCallsUpdateRenderMonth_(m,index){
  const patients=eegCallsUpdateSortPatients_(m.patients);
  const monthId=`eeg-calls-month-${eegCallsUpdateEsc_(String(m.key||index).replace(/[^A-Za-z0-9_-]/g,"-"))}`;
  let html=`<section id="${monthId}" class="card month-card"><h2 class="month-heading">${eegCallsUpdateEsc_(m.label)}</h2>`;
  if(!patients.length){
    html+=`<div class="month-empty">No EEG Call Record Available for this Month</div></section>`;
    return {html,monthId};
  }
  html+=`<div class="eeg-table-wrap"><div class="eeg-table-block"><table class="eeg-calls-table"><thead><tr><th>Sr No</th><th>Patient Name</th><th>Date of EEG</th><th>Address</th><th class="eeg-mobile-download" data-month-key="${eegCallsUpdateEsc_(String(m.key||""))}" tabindex="0" role="button" title="Download mobile numbers as CSV">Mobile Number</th><th>Payment</th><th>Referred By</th></tr></thead><tbody>`;
  patients.forEach((p,idx)=>{
    html+=`<tr><td>${idx+1}</td><td>${eegCallsUpdatePatientHtml_(p,!!m.editable)}</td><td>${eegCallsUpdateEsc_(eegCallsUpdateFormatDate_(p.date))}</td><td>${eegCallsUpdateEsc_(p.address)}</td><td>${eegCallsUpdateEsc_(p.whatsapp)}</td><td>${eegCallsUpdateEsc_(eegCallsUpdateMoney_(p.paymentReceived))}</td><td>${eegCallsUpdateEsc_(p.referredBy)}</td></tr>`;
  });
  html+=`</tbody></table></div></div><div class="month-total">Total : Calls - ${patients.length},   Collection - ${eegCallsUpdateTotalMoney_(m.collection)}</div></section>`;
  return {html,monthId};
}
function eegCallsUpdateSyncTotalWidths_(){
  const root=document.getElementById("monthlyStats");
  if(!root)return;
  const mobile=window.matchMedia("(max-width:900px)").matches;
  root.querySelectorAll(".month-card").forEach(card=>{
    const table=card.querySelector(".eeg-calls-table");
    const total=card.querySelector(".month-total");
    if(!table||!total)return;
    if(mobile){
      total.style.removeProperty("--eeg-table-width");
    }else{
      total.style.setProperty("--eeg-table-width",`${table.getBoundingClientRect().width}px`);
    }
  });
}
function eegCallsUpdateScheduleTotalWidthSync_(){
  requestAnimationFrame(()=>eegCallsUpdateSyncTotalWidths_());
}
function eegCallsUpdateRender_(records){
  const root=document.getElementById("monthlyStats");
  const months=eegCallsUpdateBuildMonths_(records);
  eegCallsUpdateState.months=months;
  let html="";
  months.forEach((m,i)=>{html+=eegCallsUpdateRenderMonth_(m,i).html;});
  root.innerHTML=html;
  eegCallsUpdateRenderCacheStatus_();
  eegCallsUpdateScheduleTotalWidthSync_();
}
function eegCallsUpdateShowHistoryError_(message){
  const box=document.getElementById("historyError");
  if(!box)return;
  box.textContent=message; box.hidden=false;
}
function eegCallsUpdateClearHistoryError_(){const box=document.getElementById("historyError");if(box){box.textContent="";box.hidden=true;}}
function eegCallsUpdateDownloadCsvForMonth_(monthKey){
  eegCallsUpdateClearHistoryError_();
  try{
    const month=eegCallsUpdateState.months.find(m=>String(m.key||"")===String(monthKey||""));
    if(!month)throw Error("EEG Calls data for this month is unavailable.");
    const patients=eegCallsUpdateSortPatients_(month.patients);
    const numbers=patients.map(p=>String(p?.whatsapp||"").replace(/\D/g,"")).filter(Boolean);
    if(!numbers.length)throw Error("No mobile numbers are available for this month.");
    const csv="\uFEFF"+numbers.join("\r\n")+"\r\n";
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const safeMonth=String(month.label||month.key||"Month").replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"Month";
    const filename=`EEG-Calls-${safeMonth}-Mobile-Numbers.csv`;
    if(typeof URL!=="undefined" && typeof URL.createObjectURL==="function"){
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=filename;
      a.style.display="none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      return;
    }
    const reader=new FileReader();
    reader.onload=()=>{
      const a=document.createElement("a");
      a.href=reader.result;
      a.download=filename;
      a.style.display="none";
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>a.remove(),1000);
    };
    reader.readAsDataURL(blob);
  }catch(e){
    eegCallsUpdateShowHistoryError_(e.message||"Unable to download EEG Calls mobile numbers.");
  }
}

function eegCallsUpdateRenderEdit_(p){
  eegCallsUpdateState.selected=p;
  eegCallsUpdateState.originMonthKey=String(p.monthKey||p.dateKey||"").substring(0,7).replace(/^(.{4})(.{2})$/,"$1-$2");
  document.getElementById("selectedPatientName").textContent=p.patientName||"";
  document.getElementById("editName").value=p.patientName||"";
  document.getElementById("editAddress").value=p.address||"";
  document.getElementById("editWhatsapp").value=p.whatsapp||"";
  document.getElementById("editReferredBy").value=p.referredBy||"";
  document.getElementById("editPayment").value=Number(p.paymentReceived)||0;
  eegCallsUpdateSetBusy_(false);
  eegCallsUpdateShow_("edit",true);
  eegCallsUpdateShow_("confirmation",false);
  document.getElementById("edit").scrollIntoView({behavior:"smooth",block:"start"});
}
function eegCallsUpdateSetBusy_(busy){
  eegCallsUpdateState.busy=busy;
  const edit=document.getElementById("edit");
  if(edit)edit.querySelectorAll("input,select,button").forEach(el=>el.disabled=busy);
  const save=document.getElementById("updateDetails");
  if(save){save.textContent=busy?"Updating EEG Details...":"Update Details";save.classList.toggle("update-busy",busy);}
  const status=document.getElementById("updateWait");
  if(status)status.hidden=!busy;
}
function eegCallsUpdateClearForm_(){
  ["editName","editAddress","editWhatsapp","editReferredBy","editPayment"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
  document.getElementById("selectedPatientName").textContent="";
  eegCallsUpdateState.selected=null;
  eegCallsUpdateState.originMonthKey="";
  eegCallsUpdateShow_("edit",false);
  document.getElementById("updateError").hidden=true;
}
function eegCallsUpdateCancel_(){
  if(eegCallsUpdateState.busy)return;
  const origin=eegCallsUpdateState.originMonthKey;
  eegCallsUpdateClearForm_();
  eegCallsUpdateShow_("confirmation",false);
  if(origin){
    const section=document.getElementById(`eeg-calls-month-${origin.replace(/[^A-Za-z0-9_-]/g,"-")}`);
    if(section)section.scrollIntoView({behavior:"smooth",block:"start"});
  }
}
function eegCallsUpdateChangedFields_(before,after){
  const fields=[
    ["Patient Name",before.patientName,after.patientName],
    ["Address",before.address,after.address],
    ["WhatsApp Number",before.whatsapp,after.whatsapp],
    ["Referred By Dr / Hospital",before.referredBy,after.referredBy],
    ["Payment Received",eegCallsUpdateMoney_(before.paymentReceived),eegCallsUpdateMoney_(after.paymentReceived)]
  ];
  return fields.filter(f=>String(f[1]??"")!==String(f[2]??""));
}
function eegCallsUpdateShowConfirmation_(r){
  const changed=eegCallsUpdateChangedFields_(r.before||{},r.after||{});
  const box=document.getElementById("confirmation");
  box.innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Details Updated Successfully</h2><p><b>Patient Name : ${eegCallsUpdateEsc_(r.after?.patientName||"")}</b></p><p><b>Changed Fields</b></p>${changed.length?`<ul class="changed-list">${changed.map(f=>`<li><b>${eegCallsUpdateEsc_(f[0])}</b>: ${eegCallsUpdateEsc_(String(f[1]??""))} → <b>${eegCallsUpdateEsc_(String(f[2]??""))}</b></li>`).join("")}</ul>`:`<p>No values were changed.</p>`}</div>`;
  eegCallsUpdateShow_("confirmation",true);
  setTimeout(()=>box.scrollIntoView({behavior:"smooth",block:"center"}),80);
}
function eegCallsUpdateNoChanges_(){
  const p=eegCallsUpdateState.selected;
  if(!p)return false;
  const text=id=>String(document.getElementById(id)?.value??"").trim();
  const phone=v=>String(v??"").replace(/\D/g,"");
  const sameText=(a,b)=>String(a??"").trim()===String(b??"").trim();
  const samePayment=Number(document.getElementById("editPayment")?.value)===Number(p.paymentReceived);
  return sameText(text("editName"),p.patientName) &&
    sameText(text("editAddress"),p.address) &&
    phone(text("editWhatsapp"))===phone(p.whatsapp) &&
    sameText(text("editReferredBy"),p.referredBy) &&
    samePayment;
}
async function eegCallsUpdateSubmit_(){
  if(eegCallsUpdateNoChanges_()){window.alert("No changes were made. Update was not done.");return;}
  const p=eegCallsUpdateState.selected;if(!p||eegCallsUpdateState.busy)return;
  const name = document.getElementById("editName").value.trim();
  const address = document.getElementById("editAddress").value.trim();
  const whatsapp = document.getElementById("editWhatsapp").value.replace(/\D/g,"").slice(0,10);
  const referredBy = document.getElementById("editReferredBy").value.trim();
  const payment = Number(document.getElementById("editPayment").value);
  if(!name)return eegCallsUpdateError_("Please enter the patient's name.");if(!address)return eegCallsUpdateError_("Please enter the patient's address.");if(!/^[6-9]\d{9}$/.test(whatsapp))return eegCallsUpdateError_("Enter a valid 10-digit WhatsApp number.");if(!referredBy)return eegCallsUpdateError_("Please enter Referred By Dr / Hospital.");if(!Number.isFinite(payment)||payment<0)return eegCallsUpdateError_("Enter a valid Payment Received amount.");
  eegCallsUpdateSetBusy_(true);document.getElementById("updateError").hidden=true;
  try{
    // Age, age unit, and EEG technician remain unchanged and are carried forward from the selected record because the backend update contract intentionally remains unchanged for this UI-only revision.
    const r=await NeuronAPI.call("updateEEGCallsPatientDetails",{rowNumber:p.rowNumber,appointmentId:p.appointmentId,patientName:name,age:p.age,ageUnit:p.ageUnit,address,whatsapp,referredBy,eegTechnician:p.eegTechnician,paymentReceived:payment},25000);
    if(!r||r.ok===false||!r.before||!r.after)throw Error("The EEG Calls update response was incomplete or invalid.");
    const cache=eegCallsUpdateState.cache||await eegCallsUpdateGetCache_();if(!cache)throw Error("Local EEG Calls cache is unavailable. Please reload the portal.");
    const idx=cache.records.findIndex(y=>Number(y.rowNumber)===Number(p.rowNumber));if(idx<0)throw Error("The updated EEG Calls record is not present in the local cache. Please reload the portal.");
    cache.records[idx]={...cache.records[idx],...r.after,ageText:`${r.after.age} ${r.after.ageUnit}`,whatsapp:r.after.whatsapp,paymentReceived:r.after.paymentReceived};
    cache.records=eegCallsUpdateTrimRecords_(cache.records);cache.lastDataUpdatedAt=eegCallsUpdateNow_();
    await eegCallsUpdateSaveCache_(cache);
    const origin=eegCallsUpdateState.originMonthKey;eegCallsUpdateSetBusy_(false);eegCallsUpdateClearForm_();eegCallsUpdateRender_(cache.records);eegCallsUpdateShowConfirmation_(r);
    if(origin){const section=document.getElementById(`eeg-calls-month-${origin.replace(/[^A-Za-z0-9_-]/g,"-")}`);if(section)section.scrollIntoView({behavior:"smooth",block:"start"});}
  }catch(e){eegCallsUpdateError_(e.message||"Unable to update EEG details. Please try again.");eegCallsUpdateSetBusy_(false);}
}
function eegCallsUpdateError_(message){
  const box=document.getElementById("updateError");if(!box)return;box.textContent=message;box.hidden=false;box.scrollIntoView({behavior:"smooth",block:"center"});
}
async function eegCallsUpdateLoad_(){
  eegCallsUpdateShow_("loading",true);eegCallsUpdateShow_("error",false);eegCallsUpdateShow_("portal",false);
  try{
    const cached=await eegCallsUpdateGetCache_();
    if(cached&&Array.isArray(cached.records)&&Number.isInteger(Number(cached.lastScannedRow))){cached.records=eegCallsUpdateTrimRecords_(cached.records);eegCallsUpdateState.cache=cached;eegCallsUpdateRender_(cached.records);eegCallsUpdateShow_("portal",true);return;}
    const r=await NeuronAPI.call("getEEGCallsRawRecords",{mode:"initial"},25000);if(!r||r.ok===false||!Array.isArray(r.records))throw Error("The EEG Calls data response was incomplete or invalid.");
    const now=eegCallsUpdateNow_();const cache={key:EEG_CALLS_CACHE_KEY,records:r.records,lastDataUpdatedAt:now,lastCheckedAt:now,lastServerCheckAt:now,lastScannedRow:Number(r.lastScannedRow)||0};await eegCallsUpdateSaveCache_(cache);eegCallsUpdateRender_(cache.records);eegCallsUpdateShow_("portal",true);
  }catch(e){const box=document.getElementById("error");box.innerHTML=`Unable to Load EEG Calls Details<br><span style="font-weight:600">${eegCallsUpdateEsc_(e.message||"Unexpected error. Please try again.")}</span><br><button id="retryEEGCalls" class="btn btn-secondary" type="button" style="margin-top:10px">Retry</button>`;eegCallsUpdateShow_("error",true);const retry=document.getElementById("retryEEGCalls");if(retry)retry.onclick=eegCallsUpdateLoad_;}
  finally{eegCallsUpdateShow_("loading",false);}
}
async function eegCallsUpdateRefreshData_(){
  if(eegCallsUpdateState.busy)return;const button=document.getElementById("updateData");if(button)button.disabled=true;eegCallsUpdateClearHistoryError_();
  try{
    const cache=eegCallsUpdateState.cache||await eegCallsUpdateGetCache_();if(!cache)throw Error("Local EEG Calls cache is unavailable. Please reload the portal.");
    const r=await NeuronAPI.call("getEEGCallsRawRecords",{mode:"latest120"},25000);if(!r||r.ok===false||!Array.isArray(r.records))throw Error("The EEG Calls update response was incomplete or invalid.");
    const now=eegCallsUpdateNow_();
    const freshCache={key:EEG_CALLS_CACHE_KEY,records:r.records,lastDataUpdatedAt:now,lastCheckedAt:now,lastServerCheckAt:now,lastScannedRow:Number(r.lastScannedRow)||0};
    await IDB.replace("cache",EEG_CALLS_CACHE_KEY,freshCache);
    eegCallsUpdateState.cache=freshCache;
    eegCallsUpdateRender_(freshCache.records);
    eegCallsUpdateRenderCacheStatus_("EEG Calls data updated successfully.");
  }catch(e){eegCallsUpdateShowHistoryError_(e.message||"Unable to update EEG Calls data. Please try again.");}
  finally{if(button)button.disabled=false;}
}

document.addEventListener("DOMContentLoaded",()=>{
  const gate=document.getElementById("gate"),password=document.getElementById("password"),enter=document.getElementById("enter");

  eegCallsUpdateShow_("loading",false);
  eegCallsUpdateShow_("error",false);
  eegCallsUpdateShow_("portal",false);
  const showPortal=()=>{eegCallsUpdateShow_("gate",false);eegCallsUpdateLoad_();};
  if(localStorage.getItem(EEG_CALLS_ACCESS_KEY)==="1"){showPortal();}
  let verifyPending=false;
  password.addEventListener("input",()=>{
    password.value=password.value.replace(/\D/g,"").slice(0,6);
    if(password.value.length===6 && !verifyPending){ verifyPending=true; verify(); }
  });
  const verify=async()=>{
    enter.disabled=true;enter.textContent="Verifying…";
    try{
      if(!/^\d{6}$/.test(password.value))throw Error("Enter the 6-digit password.");
      const h=await eegCallsUpdateSha256_(password.value);
      if(h!==EEG_CALLS_UPDATE_PASSWORD_HASH)throw Error("Incorrect password.");
      localStorage.setItem(EEG_CALLS_ACCESS_KEY,"1");showPortal();
    }catch(e){
      const old=document.getElementById("secureError");if(old)old.remove();
      const err=document.createElement("div");err.id="secureError";err.className="eeg-calls-error";err.style.marginTop="10px";err.textContent=e.message||"Unable to access portal.";gate.appendChild(err);password.focus();
    }finally{enter.disabled=false;enter.textContent="Access Portal";verifyPending=false;}
  };
  enter.onclick=verify;
  const monthlyStats=document.getElementById("monthlyStats");
  monthlyStats.addEventListener("click",e=>{
    const b=e.target.closest(".eeg-call-patient-link");
    if(!b)return;
    const row=Number(b.dataset.row);
    const patient=eegCallsUpdateState.months[0]?.patients?.find(p=>Number(p.rowNumber)===row);
    if(patient)eegCallsUpdateRenderEdit_({...patient,monthKey:eegCallsUpdateState.months[0].key});
  });
  document.getElementById("updateDetails").onclick=eegCallsUpdateSubmit_;
  document.getElementById("updateData").onclick=eegCallsUpdateRefreshData_;
  document.getElementById("cancelUpdate").onclick=eegCallsUpdateCancel_;
  const downloadMonthFromHeader=e=>{
    const th=e.target.closest(".eeg-mobile-download");
    if(!th||!monthlyStats.contains(th))return;
    eegCallsUpdateDownloadCsvForMonth_(th.dataset.monthKey||"");
  };
  monthlyStats.addEventListener("click",downloadMonthFromHeader);
  monthlyStats.addEventListener("keydown",e=>{
    if((e.key==="Enter"||e.key===" ")&&e.target.closest(".eeg-mobile-download")){
      e.preventDefault();
      downloadMonthFromHeader(e);
    }
  });
  document.getElementById("editWhatsapp").addEventListener("input",e=>{e.target.value=e.target.value.replace(/\D/g,"").slice(0,10);});
});

window.addEventListener("resize",eegCallsUpdateScheduleTotalWidthSync_);
