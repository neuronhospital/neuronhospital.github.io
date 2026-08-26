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
 document.getElementById('status').textContent='Wait we are retrieving patient information';
 api({action:'getRefundPatientByWhatsApp',whatsapp:document.getElementById('whatsapp').value,city:document.getElementById('refundCity').value}).then(x=>{
  b.textContent='Load';b.disabled=false;
  if(!x.ok) throw Error(x.error||'Error');
  document.getElementById('status').textContent='';
  render(x.patients||[]);
 }).catch(e=>{b.textContent='Load';b.disabled=false;document.getElementById('status').textContent=e.message;});
}
function render(list){
 const d=document.getElementById('patients');d.innerHTML='';
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
 if(p.refundAvailable.opd){f.innerHTML+='<section class="card"><label>OPD Refund</label><input id="opdRefund" type="number" placeholder="Enter OPD Refund Amount"></section>';}
 if(p.refundAvailable.eeg){f.innerHTML+='<section class="card"><label>EEG Refund</label><input id="eegRefund" type="number" placeholder="Enter EEG Refund Amount"></section>';}
 f.innerHTML+='<button id="refundBtn" class="cta" style="display:block;margin:20px auto" onclick="save()">Refund</button><div id="refundStatus"></div><div id="confirmation"></div>';
}
function save(){
 const btn=document.getElementById('refundBtn');
 if(!btn||!selected)return;
 btn.textContent='Processing Refund';btn.disabled=true;
 document.getElementById('refundStatus').textContent='Wait we are Processing refund';
 const opdVal=Number((document.getElementById('opdRefund')||{}).value)||0;
 const eegVal=Number((document.getElementById('eegRefund')||{}).value)||0;
 if(opdVal<=0 && eegVal<=0){btn.disabled=false;btn.textContent='Refund';document.getElementById('refundStatus').textContent='Enter refund amount';return;}
 api({action:'saveRefund',appointmentId:selected.appointmentId,city:selected.city,whatsapp:selected.whatsapp,opdRefund:opdVal,eegRefund:eegVal,updateOPD:opdVal>0,updateEEG:eegVal>0}).then(x=>{
  if(!x.ok) throw Error(x.error||'Refund failed');
  const type=[]; if(opdVal>0) type.push('OPD Refund ₹'+opdVal); if(eegVal>0) type.push('EEG Refund ₹'+eegVal);
  document.getElementById('confirmation').innerHTML='<div class="card" style="text-align:center;background:#c8f7c5"><div style="font-size:40px">✓</div><b>Refund Processed Successfully</b><br><br>Patient Name: '+selected.name+'<br>Age: '+(selected.age||'')+'<br>Appointment ID: '+selected.appointmentId+'<br>'+type.join('<br>')+'</div>';
  document.getElementById('refundStatus').textContent='';
 }).catch(e=>{btn.disabled=false;btn.textContent='Refund';document.getElementById('refundStatus').textContent=e.message;});
}
function resetRefundView(){
 selected=null;
 document.getElementById('patients').innerHTML='';
 document.getElementById('form').innerHTML='';
 const c=document.getElementById('confirmation'); if(c)c.innerHTML='';
 const rs=document.getElementById('refundStatus'); if(rs)rs.textContent='';
}
