
document.addEventListener("DOMContentLoaded",()=>{const $=U.$;let selected=null;let originalPayment={cash:0,online:0};
function setRefundChargeLock(locked){['amount','cash','online'].forEach(id=>{const el=$(id);if(!el)return;el.readOnly=locked;el.classList.toggle('refund-locked-field',locked);el.setAttribute('aria-readonly',locked?'true':'false');});['singlePayment','splitPayment'].forEach(id=>{const wrap=$(id);if(wrap)wrap.classList.toggle('refund-locked-wrap',locked);});}
function showChargeLock(){const m=$('chargeLockModal'),d=$('chargeLockDialog');if(!m)return;m.hidden=false;d?.focus()}
function hideChargeLock(){const m=$('chargeLockModal');if(m)m.hidden=true}
$('chargeLockOk')?.addEventListener('click',hideChargeLock);
$('chargeLockModal')?.addEventListener('click',e=>{if(e.target===$('chargeLockModal'))hideChargeLock()});
['amount','cash','online'].forEach(id=>$(id)?.addEventListener('click',e=>{if(e.currentTarget.readOnly)showChargeLock()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chargeLockModal')?.hidden)hideChargeLock()});
$('city').innerHTML=NEURON_CONFIG.cities.map(x=>`<option>${U.esc(x)}</option>`).join('');
const scheduledCity=window.Schedule?.cityAtNow?.(NEURON_CONFIG.cities)||'Latur';
if(NEURON_CONFIG.cities.includes(scheduledCity))$('city').value=scheduledCity;
$('city').addEventListener('change',()=>{clearState();});
function clearState(){selected=null;$('patients').innerHTML='';$('edit').hidden=true;$('confirmation').hidden=true;$('confirmation').innerHTML='';$('status').textContent='';$('amount').value='';$('cash').value='';$('online').value='';$('total').textContent='Total Amount Paid: ₹0';$('updateMessage').hidden=true;setRefundChargeLock(false);}
function setLoading(on){$('load').disabled=on;$('load').textContent=on?'Loading...':'Load';$('load').className=on?'btn btn-primary loading-state':'btn btn-secondary';$('loadMessage').hidden=!on}
function inferMode(cash,online){if(cash>0&&online>0)return 'Split';if(online>0)return 'Online';return 'Cash'}
function showPayment(x){const cash=Number(x.eegCashPaid)||0,online=Number(x.eegOnlinePaid)||0;originalPayment={cash,online};const mode=inferMode(cash,online);if(mode==='Split'){$('singlePayment').hidden=true;$('splitPayment').hidden=false;$('cash').value=cash;$('online').value=online;updateTotal()}else{$('singlePayment').hidden=false;$('splitPayment').hidden=true;$('singlePaymentLabel').textContent=mode==='Online'?'EEG Charges Paid Online':'EEG Charges Paid in Cash';$('amount').value=mode==='Online'?online:cash}}
function updateTotal(){$('total').textContent='Total Amount Paid: ₹'+((Number($('cash').value)||0)+(Number($('online').value)||0))}
function selectPatient(x,b){selected=x;document.querySelectorAll('.patient-option').forEach(z=>z.classList.remove('selected'));if(b)b.classList.add('selected');$('confirmation').hidden=true;$('confirmation').innerHTML='';$('status').textContent='';$('edit').hidden=false;$('name').value=x.name||'';$('age').value=x.age??'';$('unit').value=x.ageUnit||'years';showPayment(x);setRefundChargeLock(x.eegRefundProvided===true);setTimeout(()=>{$('name').scrollIntoView({behavior:'smooth',block:'center'});$('name').focus();},100)}
document.getElementById('wa').addEventListener('input',()=>{const msg=document.getElementById('waError');if(msg&&/^[6789]\d{9}$/.test(document.getElementById('wa').value.trim()))msg.textContent='';});$('load').onclick=async()=>{if($('load').disabled)return;if(!String($('city').value||'').trim()){$('status').textContent='Please select the city.';$('status').style.color='#b42318';$('city').focus();return;}const wa=$('wa').value.trim();if(!/^[6789]\d{9}$/.test(wa)){let msg=document.getElementById('waError');if(!msg){msg=document.createElement('div');msg.id='waError';msg.style.color='red';$('wa').closest('.input-row').parentElement.appendChild(msg)}msg.textContent='Enter 10 digit number given at the time of OPD Booking';return}let oldMsg=document.getElementById('waError');if(oldMsg)oldMsg.textContent='';clearState();setLoading(true);try{const r=await NeuronAPI.call('getEEGBookedPatientsByWhatsApp',{whatsapp:U.phone($('wa').value),city:$('city').value});if(!r.patients.length){$('status').textContent=r.todayAppointmentFound===false?`No today's appointment found for ${U.phone($('wa').value)} in ${$('city').value}.`:`No patient with a booked EEG appointment was found for this WhatsApp number in ${$('city').value} for today.`;$('status').style.color='#b42318';}else{$('status').textContent='';}r.patients.forEach(x=>{const b=document.createElement('button');b.className='patient-option';b.innerHTML=`<strong>${U.esc(x.name)}</strong><span class="patient-meta">${U.esc(x.age)} ${U.esc(x.ageUnit||'years')} • ${U.esc(x.city||'')} • ${U.date(x.date)}</span>`;b.onclick=()=>selectPatient(x,b);$('patients').appendChild(b)});if(r.patients.length===1){const b=$('patients').querySelector('.patient-option');selectPatient(r.patients[0],b)}}catch(e){$('status').textContent=e.message||'Unable to load patient details.'}finally{setLoading(false)}};
$('cash').oninput=updateTotal;$('online').oninput=updateTotal;
$('save').onclick=async()=>{
  if(!selected||$('save').disabled)return;
  const error=(message,fieldId)=>{ $('updateMessage').hidden=false; $('updateMessage').style.color='#b42318'; $('updateMessage').textContent=message; $(fieldId)?.focus(); return; };
  if(!String($('city').value||'').trim())return error('Please select the city.','city');
  const wa=U.phone($('wa').value);if(!/^[6-9]\d{9}$/.test(wa))return error('Enter a valid 10-digit WhatsApp number.','wa');
  const MAX=Number(NEURON_CONFIG.eegMax)||3000;
  let cash=0,online=0,total=0;
  if($('splitPayment').hidden){
    const raw=String($('amount').value??'').trim();
    if(raw==='')return error('EEG Charges field cannot be empty. Enter 0 if no charge was paid.','amount');
    const v=Number(raw);if(!Number.isFinite(v)||v<0||v>MAX)return error(`EEG charges must be between ₹0 and ₹${MAX}.`,'amount');
    const mode=$('singlePaymentLabel').textContent.includes('Online')?'Online':'Cash';cash=mode==='Cash'?v:0;online=mode==='Online'?v:0;total=v;
  }else{
    const cr=String($('cash').value??'').trim(),or=String($('online').value??'').trim();
    if(cr==='')return error('Paid in Cash field cannot be empty. Enter 0 if no amount was paid in cash.','cash');
    if(or==='')return error('Paid Online field cannot be empty. Enter 0 if no amount was paid online.','online');
    cash=Number(cr);online=Number(or);
    if(!Number.isFinite(cash)||cash<0||cash>MAX)return error(`Paid in Cash must be between ₹0 and ₹${MAX}.`,'cash');
    if(!Number.isFinite(online)||online<0||online>MAX)return error(`Paid Online must be between ₹0 and ₹${MAX}.`,'online');
    total=cash+online;if(total>MAX)return error(`Combined EEG charges cannot exceed ₹${MAX}.`,'cash');
  }
  $('updateMessage').style.color='';$('updateMessage').hidden=false;$('updateMessage').textContent='Wait we are updating EEG details to system...';
  const mode=inferMode(cash,online),p={appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city||$('city').value,whatsapp:selected.whatsapp||wa,whatsappNew:selected.whatsapp||wa,name:selected.name,age:Number(selected.age),ageUnit:selected.ageUnit,address:selected.address||'',referredBy:selected.referredBy||'',eegCharges:total,eegPaymentMode:mode,eegCashPaid:cash,eegOnlinePaid:online};
  $('save').disabled=true;$('save').textContent='Updating...';$('save').className='btn btn-primary loading-state';
  try{const r=await NeuronAPI.call('updateEEGDetails',p,25000);const before=r.before||{},after=r.after||{};const changes=[];const add=(label,a,b)=>{if(String(a??'')!==String(b??''))changes.push(`<div class="confirm-row"><span>${U.esc(label)}</span><b>${U.esc(String(a??''))} → ${U.esc(String(b??''))}</b></div>`)};add('EEG Charges',before.eegCharges,after.eegCharges);add('Paid in Cash',before.eegCashPaid,after.eegCashPaid);add('Paid Online',before.eegOnlinePaid,after.eegOnlinePaid);$('confirmation').hidden=false;$('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Details Updated</h2><p>Appointment ID: <b>${U.esc(r.appointmentId||selected.appointmentId)}</b></p>${changes.length?'<p><b>Changed values</b></p>'+changes.join(''):'<p>No values were changed.</p>'}</div>`;selected.eegCharges=after.eegCharges;selected.eegCashPaid=after.eegCashPaid;selected.eegOnlinePaid=after.eegOnlinePaid;originalPayment={cash:after.eegCashPaid||0,online:after.eegOnlinePaid||0};selected=null;$('patients').innerHTML='';$('edit').hidden=true;$('name').value='';$('age').value='';$('amount').value='';$('cash').value='';$('online').value='';$('total').textContent='Total Amount Paid: ₹0'}catch(e){$('updateMessage').hidden=false;$('updateMessage').style.color='#b42318';$('updateMessage').textContent=e.message||'Unable to update EEG details. Please try again.'}finally{$('save').disabled=false;$('save').textContent='Update EEG Details';$('save').className='cta'}};

});
