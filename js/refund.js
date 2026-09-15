let selected=null;
document.addEventListener('DOMContentLoaded',()=>{
 const cities=Object.keys(window.Schedule?{...window.Schedule}:{}).length?["Latur","Nilanga","Udgir","Beed","Ambajogai","Dharashiv","Omerga","Barshi"]:["Latur"];
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
 api({action:'saveRefund',appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city,whatsapp:selected.whatsapp,opdRefund:opdRaw,eegRefund:eegRaw,updateOPD:opdEntered,updateEEG:eegEntered}).then(x=>{
  if(!x.ok||!x.patient)throw Error(x.error||'Refund failed.');
  const saved=x.patient;
  showRefundConfirmation(saved);
 }).catch(e=>{
  inputs.forEach(i=>i.disabled=false);
  btn.disabled=false;
  btn.textContent='Refund';
  if(isRefundTimeoutError(e)){
   showRefundStatusCheck();
   return;
  }
  if(status){status.style.color='#b42318';status.textContent=e.message||'Refund failed. No success was recorded.';}
 });
}

function isRefundTimeoutError(e){
 const msg=String(e&&e.message||e||'');
 return /Network timeout|request may still have been recorded/i.test(msg) || e&&e.name==='TypeError';
}

function showRefundStatusCheck(){
 const form=document.getElementById('form');
 const status=document.getElementById('refundStatus');
 if(!form)return;
 let existing=document.getElementById('checkRefundStatusBtn');
 if(existing)return;
 if(status){status.style.color='#8a4b00';status.innerHTML='Unable to confirm refund processing.<br>The request may have been recorded. Please check refund status.';}
 const wrap=document.createElement('div');
 wrap.style.textAlign='center';
 const check=document.createElement('button');
 check.id='checkRefundStatusBtn';
 check.className='btn btn-secondary';
 check.textContent='Check Refund Status';
 check.style.display='block';
 check.style.margin='12px auto';
 check.onclick=checkRefundStatus;
 wrap.appendChild(check);
 form.appendChild(wrap);
}

async function checkRefundStatus(){
 const btn=document.getElementById('checkRefundStatusBtn');
 const status=document.getElementById('refundStatus');
 if(!btn||!selected)return;
 btn.disabled=true;
 btn.textContent='Checking Refund Status...';
 if(status){status.style.color='';status.textContent='Wait we are checking refund status';}
 try{
  const opdInput=document.getElementById('opdRefund'),eegInput=document.getElementById('eegRefund');
  const opdRaw=opdInput?opdInput.value.trim():'',eegRaw=eegInput?eegInput.value.trim():'';
  const x=await api({action:'checkRefundStatus',appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city,whatsapp:selected.whatsapp,opdRefund:opdRaw,eegRefund:eegRaw,updateOPD:opdRaw!=='',updateEEG:eegRaw!==''});
  btn.remove();
  if(!x.ok)throw Error(x.error||'Unable to check refund status.');
  if(!x.found){
   if(status){status.style.color='#b42318';status.textContent='Refund Not Processed';}
   return;
  }
  showRefundConfirmation(x.patient);
 }catch(e){
  if(status){status.style.color='#b42318';status.textContent=e.message||'Unable to verify refund status.';}
 }
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
