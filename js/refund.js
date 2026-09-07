let selected=null;
document.addEventListener('DOMContentLoaded',()=>{
 const cities=Object.keys(window.Schedule?{...window.Schedule}:{}).length?["Latur","Nilanga","Udgir","Beed","Ambajogai","Parli","Dharashiv","Omerga","Barshi"]:["Latur"];
 const sel=document.getElementById('refundCity');
 if(sel){cities.forEach(c=>{let o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});sel.value=window.Schedule.cityAtNow(cities);}
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
 api({action:'getRefundPatients',whatsapp:document.getElementById('whatsapp').value,city:document.getElementById('refundCity').value}).then(x=>{
  b.textContent='Load';b.disabled=false;
  if(!x.ok) throw Error(x.error||'Unable to retrieve patient information.');
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
  const opdPaid = Number(p.opdTotalPaid || 0);
  const eegPaid = Number(p.eegTotalPaid || 0);
  // Refund eligibility must follow the backend rule exactly:
  // U/V empty = refund not yet provided; U/V non-empty = already refunded.
  // Do not infer refund status from the numeric refund amount.
  const opdRefundProvided = p.opdRefundProvided === true;
  const eegRefundProvided = p.eegRefundProvided === true;
  const opdPending = opdPaid > 0 && !opdRefundProvided;
  const eegPending = eegPaid > 0 && !eegRefundProvided;
  p.refundAvailable = {opd:opdPending,eeg:eegPending};
  return opdPending || eegPending;
 });
 list.sort((a,b)=>(Number(b.bookingTimestampMs||0)-Number(a.bookingTimestampMs||0)));
 list.forEach((p,i)=>{
  let x=document.createElement('div');
  x.className='card patient-card';
  x.innerHTML='<h3>'+p.name+'</h3><p>Date of Appointment: '+(p.date||'')+'</p><p>Visit Location: '+(p.city||'')+'</p>';
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
 if(p.refundAvailable.opd){f.innerHTML+='<section class="card"><label>OPD Refund</label><input id="opdRefund" type="number" min="1" max="'+Number(p.opdTotalPaid||0)+'" placeholder="Enter OPD Refund Amount"></section>';}
 if(p.refundAvailable.eeg){f.innerHTML+='<section class="card"><label>EEG Refund</label><input id="eegRefund" type="number" min="1" max="'+Number(p.eegTotalPaid||0)+'" placeholder="Enter EEG Refund Amount"></section>';}
 f.innerHTML+='<button id="refundBtn" class="cta" style="display:block;margin:20px auto" onclick="save()">Refund</button><div id="refundStatus"></div><div id="confirmation"></div>';
}
function save(){
 const btn=document.getElementById('refundBtn');
 if(!btn||!selected)return;
 const status=document.getElementById('refundStatus');
 const inputs=[document.getElementById('opdRefund'),document.getElementById('eegRefund')].filter(Boolean);
 btn.textContent='Processing Refund';btn.disabled=true;
 inputs.forEach(i=>i.disabled=true);
 if(status){status.style.color='';status.textContent='Wait we are Processing refund';}
 const opdVal=Number((document.getElementById('opdRefund')||{}).value)||0;
 const eegVal=Number((document.getElementById('eegRefund')||{}).value)||0;
 if(!Number.isFinite(opdVal)||!Number.isFinite(eegVal)){
  inputs.forEach(i=>i.disabled=false);btn.disabled=false;btn.textContent='Refund';
  if(status){status.style.color='#b42318';status.textContent='Enter valid refund amount';}
  return;
 }
 if(opdVal<=0 && eegVal<=0){
  inputs.forEach(i=>i.disabled=false);btn.disabled=false;btn.textContent='Refund';
  if(status){status.style.color='#b42318';status.textContent='Enter refund amount';}
  return;
 }
 if(opdVal>Number(selected.opdTotalPaid||0) || eegVal>Number(selected.eegTotalPaid||0) || opdVal<0 || eegVal<0){
  inputs.forEach(i=>i.disabled=false);btn.disabled=false;btn.textContent='Refund';
  if(status){status.style.color='#b42318';status.textContent='Refund amount cannot exceed paid amount and must be greater than zero';}
  return;
 }
 api({action:'saveRefund',appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city,whatsapp:selected.whatsapp,opdRefund:opdVal,eegRefund:eegVal,updateOPD:opdVal>0,updateEEG:eegVal>0}).then(x=>{
  if(!x.ok||!x.patient) throw Error(x.error||'Refund failed.');
  const saved=x.patient;
  selected=saved;
  selected.refundAvailable={opd:false,eeg:false};
  const type=[];
  if(opdVal>0) type.push('OPD Refund ₹'+(Number(saved.opdRefund)||opdVal));
  if(eegVal>0) type.push('EEG Refund ₹'+(Number(saved.eegRefund)||eegVal));
  document.getElementById('confirmation').innerHTML='<div class="card" style="text-align:center;background:#c8f7c5"><div style="font-size:40px">✓</div><b>Refund Processed Successfully</b><br><br>Patient Name: '+(saved.name||'')+'<br>Age: '+(saved.age||'')+'<br>Appointment ID: '+(saved.appointmentId||'')+'<br>'+type.join('<br>')+'</div>';
  btn.textContent='Refund Completed';
  btn.disabled=true;
  inputs.forEach(i=>i.disabled=true);
  if(status){status.style.color='';status.textContent='';}
 }).catch(e=>{
  inputs.forEach(i=>i.disabled=false);btn.disabled=false;btn.textContent='Refund';
  if(status){status.style.color='#b42318';status.textContent=e.message||'Refund failed. No success was recorded.';}
 });
}
function resetRefundView(){
 selected=null;
 document.getElementById('patients').innerHTML='';
 document.getElementById('form').innerHTML='';
 const c=document.getElementById('confirmation'); if(c)c.innerHTML='';
 const rs=document.getElementById('refundStatus'); if(rs)rs.textContent='';
}
