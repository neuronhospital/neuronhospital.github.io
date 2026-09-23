let selected=null;
function refundTxId_(p){return `REFUND|${String(p.appointmentId||"")}|${Number(p.rowNumber)||0}|${Date.now()}|${Math.random().toString(36).slice(2,8)}`;}
function isUncertainMutationError_(e){const m=String(e?.message||e||"");return /Network timeout|request may still have been recorded|You are offline|Failed to fetch|NetworkError|fetch failed/i.test(m)||e?.name==="TypeError";}
function recoverUncertainMutation_(tx){try{void IDB.put("tx",{...tx,status:"uncertain",uncertainAt:Date.now()}).then(()=>window.NeuronRecovery?.reconcilePendingBookings?.()).catch(()=>{});}catch(_){} }
function patchRefundToday_(p,result){const patch={};if(String(p.opdRefund??'').trim()!==''){patch.opdRefund=result?.opdRefund??Number(p.opdRefund);patch.opdRefundProvided=true;}if(String(p.eegRefund??'').trim()!==''){patch.eegRefund=result?.eegRefund??Number(p.eegRefund);patch.eegRefundProvided=true;}return IDB.patchTodayPatient_({appointmentId:p.appointmentId,city:p.city,date:p.appointmentDate,patch});}

document.addEventListener('DOMContentLoaded',()=>{
 const cities=Object.keys(window.Schedule?{...window.Schedule}:{}).length?["Latur","Nilanga","Udgir","Beed","Ambajogai","Dharashiv","Omerga","Barshi"]:["Latur"];
 const sel=document.getElementById('refundCity');
 if(sel){cities.forEach(c=>{let o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});const defaultCity=window.DailyCity?.get?.()||window.Schedule.cityAtNow(cities);if(cities.includes(defaultCity))sel.value=defaultCity;}
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
 if(!validWhatsapp()) return;
 resetRefundView();
 const b=document.getElementById('loadBtn');b.textContent='Loading...';b.disabled=true;
 document.getElementById('status').style.color='';
 document.getElementById('status').textContent='Wait we are retrieving patient information';
 IDB.getTodayPatientsByWhatsApp_({whatsapp:document.getElementById('whatsapp').value,city:document.getElementById('refundCity').value}).then(x=>{
  b.textContent='Load';b.disabled=false;
  const patients=x.patients||[];
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
 if(p.refundAvailable.opd){f.innerHTML+='<section class="card"><label class="required-field">OPD Refund</label><input id="opdRefund" type="number" min="1" max="'+Number(p.opdTotalPaid||0)+'" placeholder="Enter OPD Refund Amount"></section>';}
 if(p.refundAvailable.eeg){f.innerHTML+='<section class="card"><label class="required-field">EEG Refund</label><input id="eegRefund" type="number" min="1" max="'+Number(p.eegTotalPaid||0)+'" placeholder="Enter EEG Refund Amount"></section>';}
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
 if(opdEntered && (!Number.isFinite(opdVal)||opdVal<=0||opdVal>opdPaid)){
  return error(opdInput);
 }
 if(eegEntered && (!Number.isFinite(eegVal)||eegVal<=0||eegVal>eegPaid)){
  return error(eegInput);
 }
 btn.textContent='Processing Refund';btn.disabled=true;inputs.forEach(i=>i.disabled=true);
 if(status){status.style.color='';status.textContent='Wait we are Processing refund';}
 const p={appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city,opdRefund:opdRaw,eegRefund:eegRaw,updateOPD:opdEntered,updateEEG:eegEntered};
 const tx={id:refundTxId_(p),type:"REFUND",status:"pending",startedAt:Date.now(),timeoutMs:25000,payload:p};
 api({action:'saveRefund',appointmentId:p.appointmentId,rowNumber:p.rowNumber,city:p.city,opdRefund:p.opdRefund,eegRefund:p.eegRefund,updateOPD:p.updateOPD,updateEEG:p.updateEEG}).then(async x=>{
  if(!x.ok)throw Error(x.error||'Refund failed.');
  const patched=await patchRefundToday_(p,x);
  if(!patched?.updated||!patched.patient)throw Error("Refund was saved, but today's OPD cache could not be synchronized. Please reload the patient after synchronization.");
  try{await IDB.put("tx",{...tx,status:"complete",result:x,completedAt:Date.now()});}catch(_){}
  const saved=patched.patient;
  window.NeuronPatientActionContext?.notify?.("REFUND");
  showRefundConfirmation(saved);
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
 if(c)c.innerHTML='<div class="card" style="text-align:center;background:#c8f7c5"><div style="font-size:40px">✓</div><b>Refund Processed Successfully</b><br><br>Patient Name: '+(saved.name||'')+'<br>Age: '+(saved.age||'')+'<br>Appointment ID: '+(saved.appointmentId||'')+'<br>'+type.join('<br>')+'</div>';
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
 const cityEl=document.getElementById('refundCity');
 if(cityEl && p.city)cityEl.value=String(p.city);
 const w=document.getElementById('whatsapp'); if(w)w.value=String(p.whatsapp||"").replace(/\D/g,"").slice(-10);
 const r=window.NeuronPatientActionRules?.refundAvailability?.(p) || {opd:false,eeg:false};
 p.refundAvailable=r;
 document.getElementById('patients').innerHTML='';
 const x=document.createElement('div'); x.className='card patient-card'; x.innerHTML='<h3>'+U.esc(p.name||'')+'</h3>';
 document.getElementById('patients').appendChild(x);
 selectPatient(p,x);
});
