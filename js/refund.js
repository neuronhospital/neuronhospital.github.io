let selected=null;
function api(body){return NeuronAPI.call(body.action, body);}
function loadRefund(){
 resetRefundView();
 const b=document.getElementById('loadBtn');b.textContent='Loading...';b.style.background='#999';
 document.getElementById('status').textContent='Wait we are retrieving patient information';
 api({action:'getRefundPatientByWhatsApp',whatsapp:document.getElementById('whatsapp').value}).then(x=>{
  b.textContent='Load';b.style.background='';
  if(!x.ok) throw Error(x.error||'Error');
  render(x.patients);
 }).catch(e=>document.getElementById('status').textContent=e.message);
}
function render(list){
 const d=document.getElementById('patients');d.innerHTML='';
 list.forEach((p,i)=>{let x=document.createElement('div');x.textContent=p.name+' '+p.city;x.onclick=()=>selectPatient(p,x);d.appendChild(x);if(list.length===1)selectPatient(p,x);});
}
function selectPatient(p,x){selected=p;document.querySelectorAll('#patients div').forEach(e=>e.style.background='');x.style.background='#c8f7c5';let f=document.getElementById('form');f.innerHTML='';
 if(p.refundAvailable.opd){f.innerHTML+='<input id="opdRefund" placeholder="OPD Refund">';}
 if(p.refundAvailable.eeg){f.innerHTML+='<input id="eegRefund" placeholder="EEG Refund">';}
 f.innerHTML+='<button id="refundBtn" onclick="save()">Refund</button><div id="refundStatus"></div><div id="confirmation"></div>';
}
function save(){
 const btn=document.getElementById('refundBtn');
 if(!btn||!selected)return;
 btn.textContent='Processing Refund';
 btn.disabled=true;
 document.getElementById('refundStatus').textContent='Wait we are Processing refund';
 api({action:'saveRefund',appointmentId:selected.appointmentId,city:selected.city,whatsapp:selected.whatsapp,opdRefund:(document.getElementById('opdRefund')||{}).value||0,eegRefund:(document.getElementById('eegRefund')||{}).value||0}).then(x=>{
  if(!x.ok) throw Error(x.error||'Refund failed');
  document.getElementById('confirmation').innerHTML='<div class="refund-success">✓<br>Refund processed Successfully<br>Appointment ID: '+selected.appointmentId+'<br>Patient Name: '+selected.name+'<br>Refund Amount: ₹'+((Number((document.getElementById('opdRefund')||{}).value)||0)+(Number((document.getElementById('eegRefund')||{}).value)||0))+'</div>';
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
