let selected=null;
function refundTxId_(){return (window.crypto&&typeof window.crypto.randomUUID==="function")?window.crypto.randomUUID():"REFUND_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,14);}
function validRefundAmount_(raw,paid){const text=String(raw==null?"":raw);if(!/^[0-9]+$/.test(text))return false;const value=Number(text),maximum=Number(paid);return Number.isSafeInteger(value)&&Number.isFinite(maximum)&&value>0&&value<=maximum;}
function isUncertainMutationError_(e){const m=String(e?.message||e||"");return /Network timeout|request may still have been recorded|You are offline|Failed to fetch|NetworkError|fetch failed/i.test(m)||e?.name==="TypeError";}
function recoverUncertainMutation_(tx){try{void IDB.put("tx",{...tx,status:"uncertain",uncertainAt:Date.now()}).then(()=>window.NeuronRecovery?.reconcilePendingBookings?.()).catch(()=>{});}catch(_){} }

document.addEventListener('DOMContentLoaded',()=>{
 const allCities=Array.isArray(window.NEURON_CONFIG?.cities)&&window.NEURON_CONFIG.cities.length?window.NEURON_CONFIG.cities:["Latur","Nilanga","Udgir","Beed","Ambajogai","Dharashiv","Omerga","Barshi"];
 const auth=window.NeuronAuth?.get?.();
 const cities=auth?.admin?allCities:allCities.filter(c=>String(c).toLowerCase()===String(auth?.city||"").toLowerCase());
 const sel=document.getElementById('refundCity');
 if(sel){sel.innerHTML="";cities.forEach(c=>{let o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});const defaultCity=auth?.admin?(window.DailyCity?.get?.()||window.Schedule?.cityAtNow?.(cities)):auth?.city;if(cities.includes(defaultCity))sel.value=defaultCity;else if(cities.length)sel.value=cities[0];if(!cities.length){sel.disabled=true;const status=document.getElementById("status");if(status)status.textContent="No refund city is assigned to this account.";}}
 const w=document.getElementById('whatsapp');
 if(w)w.addEventListener('input',validateWhatsapp);
});
function validateWhatsapp(){
 const w=document.getElementById('whatsapp'),e=document.getElementById('whatsappError');
 if(!w||!e)return;
 if(/^[6-9]\d{9}$/.test(w.value)) e.textContent='';
 else e.textContent='Enter 10 digit number given at the time of OPD Booking';
}
function validWhatsapp(){
 validateWhatsapp();
 return /^[6-9]\d{9}$/.test(document.getElementById('whatsapp').value);
}
function api(body){return NeuronAPI.call(body.action, body);}
function loadRefund(){
 if(!document.getElementById('refundCity')?.value){const status=document.getElementById('status');if(status){status.style.color='#b42318';status.textContent='No refund city is available for this account.';}return;}
 if(!validWhatsapp()) return;
 resetRefundView();
 const b=document.getElementById('loadBtn');b.textContent='Loading...';b.disabled=true;
 document.getElementById('status').style.color='';
 document.getElementById('status').textContent='Wait we are retrieving patient information';
 IDB.getTodayPatientsByWhatsApp_({whatsapp:document.getElementById('whatsapp').value,city:document.getElementById('refundCity').value}).then(x=>{
  b.textContent='Load';b.disabled=false;
  const patients=(x.patients||[]).filter(p=>{const auth=window.NeuronAuth?.get?.();return auth?.admin||String(p?.city||"").toLowerCase()===String(auth?.city||"").toLowerCase();});
  if(!patients.length){
   document.getElementById('status').textContent=x.todayAppointmentFound===false
    ? `No today's appointment found for ${document.getElementById('whatsapp').value} in ${document.getElementById('refundCity').value}.`
    : `No refundable patient found for this WhatsApp number in ${document.getElementById('refundCity').value} for today.`;
   document.getElementById('status').style.color='#b42318';
   return;
  }
  document.getElementById('status').textContent='';
  render(patients);
 }).catch(e=>{
  b.textContent='Load';b.disabled=false;
  document.getElementById('status').style.color='#b42318';
  document.getElementById('status').textContent=e.message||'Unable to retrieve patient information.';
 });
}
function render(list){
 const d=document.getElementById('patients');d.innerHTML='';
 // Final client-side safety filter. Backend should already send only eligible
 // patients, but this prevents display of fully refunded records if stale data
 // reaches the browser.
 list = (list || []).filter(p=>{
  const refund = window.NeuronPatientActionRules?.refundAvailability?.(p) || {opd:false,eeg:false};
  p.refundAvailable = refund;
  return refund.opd || refund.eeg;
 });
 list.sort((a,b)=>{const sa=Number(String(a?.appointmentId||"").match(/-(\d+)$/)?.[1]),sb=Number(String(b?.appointmentId||"").match(/-(\d+)$/)?.[1]);if(Number.isFinite(sa)&&Number.isFinite(sb)&&sa!==sb)return sb-sa;const at=String(a?.date||"")+String(a?.time||"");const bt=String(b?.date||"")+String(b?.time||"");if(bt!==at)return bt.localeCompare(at);return (Number(b?.rowNumber)||0)-(Number(a?.rowNumber)||0);});
 list.forEach((p,i)=>{
  let x=document.createElement('div');
  x.className='card patient-card';
  const paymentLines=[];
  if(p.refundAvailable.opd) paymentLines.push('OPD Paid : ₹'+Number(p.opdTotalPaid||0));
  if(p.refundAvailable.eeg) paymentLines.push('EEG Paid : ₹'+Number(p.eegTotalPaid||0));
  x.innerHTML='<h3>'+U.esc(p.name||'')+'</h3>'+paymentLines.map(v=>'<p>'+U.esc(v)+'</p>').join('');
  x.onclick=()=>selectPatient(p,x);
  d.appendChild(x);
  if(list.length===1)selectPatient(p,x);
 });
}
function selectPatient(p,x){
 selected=p;
 document.querySelectorAll('#patients .patient-card').forEach(e=>e.style.background='');
 x.style.background='#c8f7c5';
 x.scrollIntoView({behavior:'smooth',block:'center'});
 setTimeout(()=>{document.getElementById('form')?.scrollIntoView({behavior:'smooth',block:'start'});},300);
 let f=document.getElementById('form');f.innerHTML='';
 if(p.refundAvailable.opd){f.innerHTML+='<section class="card"><label class="required-field" for="opdRefund">OPD Refund (max ₹'+Number(p.opdTotalPaid||0)+')</label><input id="opdRefund" type="number" inputmode="numeric" step="1" min="1" max="'+Number(p.opdTotalPaid||0)+'" placeholder="Enter OPD Refund Amount"></section>';}
 if(p.refundAvailable.eeg){f.innerHTML+='<section class="card"><label class="required-field" for="eegRefund">EEG Refund (max ₹'+Number(p.eegTotalPaid||0)+')</label><input id="eegRefund" type="number" inputmode="numeric" step="1" min="1" max="'+Number(p.eegTotalPaid||0)+'" placeholder="Enter EEG Refund Amount"></section>'; }
 f.innerHTML+='<button id="refundBtn" class="cta" style="display:block;margin:20px auto" onclick="save()">Refund</button><div id="refundStatus"></div><div id="confirmation"></div>';
}
function save(){
 const btn=document.getElementById('refundBtn');
 if(!btn||!selected)return;
 const status=document.getElementById('refundStatus');
 const inputs=[document.getElementById('opdRefund'),document.getElementById('eegRefund')].filter(Boolean);
 const error=(field)=>{
  if(status){status.style.color='#b42318';status.innerHTML='Enter Correct Amount<br>Refund amount should be greater than Zero and Equal or Less Than Paid Amount';}
  if(field)field.focus();
 };
 const opdInput=document.getElementById('opdRefund'),eegInput=document.getElementById('eegRefund');
 const opdRaw=opdInput?opdInput.value.trim():'';
 const eegRaw=eegInput?eegInput.value.trim():'';
 const opdEntered=opdRaw!=='';
 const eegEntered=eegRaw!=='';
 if(!opdEntered && !eegEntered){
  if(status){status.style.color='#b42318';status.textContent='Enter an OPD or EEG refund amount.';}
  if(opdInput)opdInput.focus();
  return;
 }
 const opdVal=opdEntered?Number(opdRaw):0;
 const eegVal=eegEntered?Number(eegRaw):0;
 const opdPaid=Number(selected.opdTotalPaid||0),eegPaid=Number(selected.eegTotalPaid||0);
 if(opdEntered && !validRefundAmount_(opdRaw,opdPaid)){
  return error(opdInput);
 }
 if(eegEntered && !validRefundAmount_(eegRaw,eegPaid)){
  return error(eegInput);
 }
 btn.textContent='Processing Refund';btn.disabled=true;inputs.forEach(i=>i.disabled=true);
 if(status){status.style.color='';status.textContent='Wait we are Processing refund';}
 const mutationId=refundTxId_();
 const credentials=window.NeuronAuth?.getCredentials?.()||{};
 const p={appointmentId:selected.appointmentId,bookingRequestId:String(selected.bookingRequestId||""),rowNumber:selected.rowNumber,city:selected.city,mutationId,sourceInstallationId:String(credentials.installationId||""),opdRefund:opdRaw,eegRefund:eegRaw,updateOPD:opdEntered,updateEEG:eegEntered};
 if(!/^[A-Z]{8}$/.test(p.bookingRequestId)){inputs.forEach(i=>i.disabled=false);btn.disabled=false;btn.textContent="Refund";if(status){status.style.color="#b42318";status.textContent="Booking request identity is missing. Reload today's OPD and try again.";}return;}
 const tx={id:mutationId,type:"REFUND",status:"pending",startedAt:Date.now(),timeoutMs:25000,payload:p};
 api({action:'saveRefund',bookingRequestId:p.bookingRequestId,appointmentId:p.appointmentId,rowNumber:p.rowNumber,city:p.city,mutationId:p.mutationId,sourceInstallationId:p.sourceInstallationId,opdRefund:p.opdRefund,eegRefund:p.eegRefund,updateOPD:p.updateOPD,updateEEG:p.updateEEG}).then(async x=>{
  if(!x.ok)throw Error(x.error||'Refund failed.');
  let patched={updated:false,patient:null};try{patched=await IDB.updateTodayOPDFromMutation_({kind:"REFUND",result:x,payload:p})||patched;}catch(_){}
  try{await IDB.put("tx",{...tx,status:"complete",result:x,completedAt:Date.now()});}catch(_){}
  const saved={...(patched.patient||selected||{})};if(p.updateOPD) {saved.opdRefund=x.opdRefund??saved.opdRefund;saved.opdRefundProvided=true;}if(p.updateEEG) {saved.eegRefund=x.eegRefund??saved.eegRefund;saved.eegRefundProvided=true;}
  window.NeuronPatientActionContext?.notify?.("REFUND");
  showRefundConfirmation(saved);
  void NeuronAPI.dispatchFCM?.(x.eventId);
  const refund = window.NeuronPatientActionRules?.refundAvailability?.(saved) || {opd:false,eeg:false};
  saved.refundAvailable = refund;
  if(refund.opd||refund.eeg)render([saved]);
 }).catch(e=>{
  inputs.forEach(i=>i.disabled=false);
  btn.disabled=false;
  btn.textContent='Refund';
  if(isUncertainMutationError_(e)){
   recoverUncertainMutation_(tx);
   if(status){status.style.color='#8a4b00';status.innerHTML='Unable to confirm the refund. Recovery has started automatically.';}
   return;
  }
  try{void IDB.put("tx",{...tx,status:"failed",failedAt:Date.now(),failureReason:String(e?.message||e||"")});}catch(_){ }
  if(status){status.style.color='#b42318';status.textContent=e.message||'Refund failed. No success was recorded.';}
 });
}

function showRefundConfirmation(saved){
 const btn=document.getElementById('refundBtn');
 const inputs=[document.getElementById('opdRefund'),document.getElementById('eegRefund')].filter(Boolean);
 const opdVal=Number(saved&&saved.opdRefund)||0,eegVal=Number(saved&&saved.eegRefund)||0;
 const type=[];
 if(opdVal>0)type.push('OPD Refund ₹'+opdVal);
 if(eegVal>0)type.push('EEG Refund ₹'+eegVal);
 const c=document.getElementById('confirmation');
 if(c)c.innerHTML='<div class="card" style="text-align:center;background:#c8f7c5"><div style="font-size:40px" aria-hidden="true">✓</div><b>Refund Processed Successfully</b><br><br>Patient Name: '+U.esc(saved.name||'')+'<br>Age: '+U.esc(saved.age||'')+'<br>Appointment ID: '+U.esc(saved.appointmentId||'')+'<br>'+type.map(U.esc).join('<br>')+'</div>';
 if(btn){btn.textContent='Refund Completed';btn.disabled=true;}
 inputs.forEach(i=>i.disabled=true);
 const status=document.getElementById('refundStatus');
 if(status){status.style.color='';status.textContent='';}
 selected=saved;
 selected.refundAvailable={opd:false,eeg:false};
}

function resetRefundView(){
 selected=null;
 document.getElementById('patients').innerHTML='';
 document.getElementById('form').innerHTML='';
 const c=document.getElementById('confirmation'); if(c)c.innerHTML='';
 const rs=document.getElementById('refundStatus'); if(rs)rs.textContent='';
}


document.addEventListener("DOMContentLoaded",()=>{
 const ctx=window.NeuronPatientActionContext?.read?.();
 if(new URLSearchParams(location.search).get("patientAction")!=="1" || !ctx?.patient)return;
 const p=ctx.patient;
 const auth=window.NeuronAuth?.get?.();
 if(!auth?.admin&&String(p.city||"").toLowerCase()!==String(auth?.city||"").toLowerCase()){
  const status=document.getElementById("status");if(status){status.style.color="#b42318";status.textContent="This patient's city is outside your assigned refund access.";}return;
 }
 const cityEl=document.getElementById('refundCity');
 if(cityEl && p.city && [...cityEl.options].some(o=>o.value===String(p.city)))cityEl.value=String(p.city);
 const w=document.getElementById('whatsapp'); if(w)w.value=String(p.whatsapp||"").replace(/\D/g,"").slice(-10);
 const r=window.NeuronPatientActionRules?.refundAvailability?.(p) || {opd:false,eeg:false};
 p.refundAvailable=r;
 document.getElementById('patients').innerHTML='';
 const x=document.createElement('div'); x.className='card patient-card'; x.innerHTML='<h3>'+U.esc(p.name||'')+'</h3>';
 document.getElementById('patients').appendChild(x);
 selectPatient(p,x);
});
