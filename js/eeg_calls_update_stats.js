const EEG_CALLS_ACCESS_KEY="neuron_eeg_calls_access";
const EEG_CALLS_UPDATE_PASSWORD_HASH="7931486c46d8a4d07e683f1dfa62296fe5ffe494746c59b02a5540a1f1423390";
let eegCallsUpdateState={months:[],selected:null,busy:false,originMonthKey:""};

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
  const s=String(date||"").replace(/\D/g,"");
  if(/^\d{8}$/.test(s))return `${s.substring(0,2)}/${s.substring(2,4)}/${s.substring(4,8)}`;
  return String(date||"");
}
function eegCallsUpdateSortPatients_(patients){
  return [...(Array.isArray(patients)?patients:[])].sort((a,b)=>{
    const ad=String(a?.dateKey||"");
    const bd=String(b?.dateKey||"");
    if(ad!==bd)return ad.localeCompare(bd);
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
function eegCallsUpdateRender_(r){
  const root=document.getElementById("monthlyStats");
  const months=Array.isArray(r.months)?r.months:[];
  eegCallsUpdateState.months=months;
  if(!months.length){root.innerHTML=`<div class="card eeg-calls-error">Unable to prepare EEG Calls details.</div>`;return;}
  let html="";
  months.forEach((m,i)=>{html+=eegCallsUpdateRenderMonth_(m,i).html;});
  root.innerHTML=html;
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
async function eegCallsUpdateSubmit_(){
  const p=eegCallsUpdateState.selected;if(!p||eegCallsUpdateState.busy)return;
  const name=document.getElementById("editName").value.trim();
  const address=document.getElementById("editAddress").value.trim();
  const whatsapp=document.getElementById("editWhatsapp").value.replace(/\D/g,"").slice(0,10);
  const referredBy=document.getElementById("editReferredBy").value.trim();
  const payment=Number(document.getElementById("editPayment").value);
  if(!name)return eegCallsUpdateError_("Please enter the patient's name.");
  if(!address)return eegCallsUpdateError_("Please enter the patient's address.");
  if(!/^[6-9]\d{9}$/.test(whatsapp))return eegCallsUpdateError_("Enter a valid 10-digit WhatsApp number.");
  if(!referredBy)return eegCallsUpdateError_("Please enter Referred By Dr / Hospital.");
  if(!Number.isFinite(payment)||payment<0)return eegCallsUpdateError_("Enter a valid Payment Received amount.");
  eegCallsUpdateSetBusy_(true);
  document.getElementById("updateError").hidden=true;
  try{
    // Age, age unit, and EEG technician remain unchanged and are carried
    // forward from the selected record because the backend update contract
    // intentionally remains unchanged for this UI-only revision.
    const r=await NeuronAPI.call("updateEEGCallsPatientDetails",{
      rowNumber:p.rowNumber,
      appointmentId:p.appointmentId,
      patientName:name,
      age:p.age,
      ageUnit:p.ageUnit,
      address,
      whatsapp,
      referredBy,
      eegTechnician:p.eegTechnician,
      paymentReceived:payment
    },25000);
    if(!r||r.ok===false||!r.before||!r.after)throw Error("The EEG Calls update response was incomplete or invalid.");
    const m=eegCallsUpdateState.months.find(x=>Array.isArray(x.patients)&&x.patients.some(y=>Number(y.rowNumber)===Number(p.rowNumber)));
    if(m){
      const idx=m.patients.findIndex(y=>Number(y.rowNumber)===Number(p.rowNumber));
      if(idx>=0){
        m.patients[idx]={...m.patients[idx],...r.after,ageText:`${r.after.age} ${r.after.ageUnit}`,whatsapp:r.after.whatsapp,paymentReceived:r.after.paymentReceived};
        m.collection=m.patients.reduce((t,x)=>t+(Number(x.paymentReceived)||0),0);
        m.totalCalls=m.patients.length;
      }
    }
    const origin=eegCallsUpdateState.originMonthKey;
    eegCallsUpdateSetBusy_(false);
    eegCallsUpdateClearForm_();
    eegCallsUpdateRender_({months:eegCallsUpdateState.months});
    eegCallsUpdateShowConfirmation_(r);
    if(origin){
      const section=document.getElementById(`eeg-calls-month-${origin.replace(/[^A-Za-z0-9_-]/g,"-")}`);
      if(section)section.scrollIntoView({behavior:"smooth",block:"start"});
    }
  }catch(e){
    eegCallsUpdateError_(e.message||"Unable to update EEG details. Please try again.");
    eegCallsUpdateSetBusy_(false);
  }
}
function eegCallsUpdateError_(message){
  const box=document.getElementById("updateError");if(!box)return;box.textContent=message;box.hidden=false;box.scrollIntoView({behavior:"smooth",block:"center"});
}
async function eegCallsUpdateLoad_(){
  eegCallsUpdateShow_("loading",true);eegCallsUpdateShow_("error",false);eegCallsUpdateShow_("portal",false);eegCallsUpdateShow_("edit",false);eegCallsUpdateShow_("confirmation",false);
  try{
    const r=await NeuronAPI.call("getEEGCallsUpdateStats",{},25000);
    if(!r||r.ok===false||!Array.isArray(r.months))throw Error("The EEG Calls data response was incomplete or invalid.");
    eegCallsUpdateRender_(r);eegCallsUpdateShow_("portal",true);
  }catch(e){
    const box=document.getElementById("error");
    box.innerHTML=`Unable to Load EEG Calls Details<br><span style="font-weight:600">${eegCallsUpdateEsc_(e.message||"Unexpected error. Please try again.")}</span><br><button id="retryEEGCalls" class="btn btn-secondary" type="button" style="margin-top:10px">Retry</button>`;
    eegCallsUpdateShow_("error",true);const retry=document.getElementById("retryEEGCalls");if(retry)retry.onclick=eegCallsUpdateLoad_;
  }finally{eegCallsUpdateShow_("loading",false);}
}

document.addEventListener("DOMContentLoaded",()=>{
  const gate=document.getElementById("gate"),password=document.getElementById("password"),enter=document.getElementById("enter");

  eegCallsUpdateShow_("loading",false);
  eegCallsUpdateShow_("error",false);
  eegCallsUpdateShow_("portal",false);
  const showPortal=()=>{eegCallsUpdateShow_("gate",false);eegCallsUpdateLoad_();};
  if(localStorage.getItem(EEG_CALLS_ACCESS_KEY)==="1"){showPortal();}
  const focusSecurePassword=()=>{
    if(!gate||gate.hidden||!password)return;
    try{password.focus({preventScroll:false});}catch(e){try{password.focus();}catch(_) {}}
  };
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
  focusSecurePassword();
});

window.addEventListener("resize",eegCallsUpdateScheduleTotalWidthSync_);
