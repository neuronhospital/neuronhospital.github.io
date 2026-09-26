
function eegUpdateTxId_(p){return `EEG_UPDATE|${String(p.appointmentId||"")}|${Number(p.rowNumber)||0}|${Date.now()}|${Math.random().toString(36).slice(2,8)}`;}
function isUncertainMutationError_(e){const m=String(e?.message||e||"");return /Network timeout|request may still have been recorded|You are offline|Failed to fetch|NetworkError|fetch failed/i.test(m)||e?.name==="TypeError";}
function recoverUncertainMutation_(tx){try{void IDB.put("tx",{...tx,status:"uncertain",uncertainAt:Date.now()}).then(()=>window.NeuronRecovery?.reconcilePendingBookings?.()).catch(()=>{});}catch(_){} }

document.addEventListener("DOMContentLoaded",()=>{const $=U.$;let selected=null;let originalPayment={cash:0,online:0};
function setRefundChargeLock(locked){['amount','cash','online'].forEach(id=>{const el=$(id);if(!el)return;el.readOnly=locked;el.classList.toggle('refund-locked-field',locked);el.setAttribute('aria-readonly',locked?'true':'false');});const modeEl=$('paymentMode');if(modeEl){modeEl.disabled=locked;modeEl.classList.toggle('refund-locked-field',locked);modeEl.setAttribute('aria-disabled',locked?'true':'false');}['singlePayment','splitPayment'].forEach(id=>{const wrap=$(id);if(wrap)wrap.classList.toggle('refund-locked-wrap',locked);});}
function showChargeLock(){const m=$('chargeLockModal'),d=$('chargeLockDialog');if(!m)return;m.hidden=false;d?.focus()}
function hideChargeLock(){const m=$('chargeLockModal');if(m)m.hidden=true}
$('chargeLockOk')?.addEventListener('click',hideChargeLock);
$('chargeLockModal')?.addEventListener('click',e=>{if(e.target===$('chargeLockModal'))hideChargeLock()});
['amount','cash','online'].forEach(id=>$(id)?.addEventListener('click',e=>{if(e.currentTarget.readOnly)showChargeLock()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chargeLockModal')?.hidden)hideChargeLock()});
$('city').innerHTML=NEURON_CONFIG.cities.map(x=>`<option>${U.esc(x)}</option>`).join('');
const defaultCity=window.DailyCity?.get?.()||window.Schedule?.cityAtNow?.(NEURON_CONFIG.cities)||'Latur';
if(NEURON_CONFIG.cities.includes(defaultCity))$('city').value=defaultCity;
$('city').addEventListener('change',()=>{clearState();});
function clearState(){selected=null;$('patients').innerHTML='';$('edit').hidden=true;$('confirmation').hidden=true;$('confirmation').innerHTML='';$('status').textContent='';$('amount').value='';$('cash').value='';$('online').value='';$('total').textContent='Total Amount Paid: ₹0';$('updateMessage').hidden=true;setRefundChargeLock(false);}
function setLoading(on){$('load').disabled=on;$('load').textContent=on?'Loading...':'Load';$('load').className=on?'btn btn-primary loading-state':'btn btn-secondary';$('loadMessage').hidden=!on}
function inferMode(cash,online){if(cash>0&&online>0)return 'Split';if(online>0)return 'Online';return 'Cash'}
function showPayment(x){const cash=Number(x.eegCashPaid)||0,online=Number(x.eegOnlinePaid)||0;originalPayment={cash,online};const mode=inferMode(cash,online);$('paymentMode').value=mode;previousPaymentMode=mode;if(mode==='Split'){$('singlePayment').hidden=true;$('splitPayment').hidden=false;$('cash').value=cash||'';$('online').value=online||'';updateTotal()}else{$('singlePayment').hidden=false;$('splitPayment').hidden=true;$('singlePaymentLabel').textContent=mode==='Online'?'EEG Charges Paid Online':'EEG Charges Paid in Cash';$('amount').value=mode==='Online'?online:cash}}
function updateTotal(){$('total').textContent='Total Amount Paid: ₹'+((Number($('cash').value)||0)+(Number($('online').value)||0))}
let previousPaymentMode='Cash';$('paymentMode').addEventListener('change',()=>{const nextMode=$('paymentMode').value;const previousMode=previousPaymentMode;const total=previousMode==='Split'?((Number($('cash').value)||0)+(Number($('online').value)||0)):Number($('amount').value)||0;if(nextMode==='Split'){if(previousMode==='Cash'){$('cash').value=total||'';$('online').value='';}else if(previousMode==='Online'){$('cash').value='';$('online').value=total||'';}else{$('cash').value=Number($('cash').value)||'';$('online').value=Number($('online').value)||'';}$('singlePayment').hidden=true;$('splitPayment').hidden=false;updateTotal();}else{$('singlePayment').hidden=false;$('splitPayment').hidden=true;$('amount').value=total||'';$('cash').value='';$('online').value='';$('singlePaymentLabel').textContent=nextMode==='Online'?'EEG Charges Paid Online':'EEG Charges Paid in Cash';}previousPaymentMode=nextMode;});
function selectPatient(x,b){selected=x;document.querySelectorAll('.patient-option').forEach(z=>z.classList.remove('selected'));if(b)b.classList.add('selected');$('confirmation').hidden=true;$('confirmation').innerHTML='';$('status').textContent='';$('edit').hidden=false;$('name').value=x.name||'';$('age').value=x.age??'';$('unit').value=x.ageUnit||'years';showPayment(x);setRefundChargeLock(x.eegRefundProvided===true);setTimeout(()=>{$('name').scrollIntoView({behavior:'smooth',block:'center'});$('name').focus();},100)}
document.getElementById('wa').addEventListener('input',()=>{const msg=document.getElementById('waError');if(msg&&/^[6789]\d{9}$/.test(document.getElementById('wa').value.trim()))msg.textContent='';});$('load').onclick=async()=>{if($('load').disabled)return;if(!String($('city').value||'').trim()){$('status').textContent='Please select the city.';$('status').style.color='#b42318';$('city').focus();return;}const wa=$('wa').value.trim();if(!/^[6789]\d{9}$/.test(wa)){let msg=document.getElementById('waError');if(!msg){msg=document.createElement('div');msg.id='waError';msg.style.color='red';$('wa').closest('.input-row').parentElement.appendChild(msg)}msg.textContent='Enter 10 digit number given at the time of OPD Booking';return}let oldMsg=document.getElementById('waError');if(oldMsg)oldMsg.textContent='';clearState();setLoading(true);try{const r=await IDB.getTodayPatientsByWhatsApp_({whatsapp:U.phone($('wa').value),city:$('city').value});r.patients=(r.patients||[]).filter(p=>p.eegCharges!==null&&p.eegCharges!==undefined&&p.eegCharges!=='');r.patients.sort((a,b)=>{const sa=Number(String(a?.appointmentId||"").match(/-(\d+)$/)?.[1]),sb=Number(String(b?.appointmentId||"").match(/-(\d+)$/)?.[1]);if(Number.isFinite(sa)&&Number.isFinite(sb)&&sa!==sb)return sb-sa;const at=String(a?.date||"")+String(a?.time||"");const bt=String(b?.date||"")+String(b?.time||"");if(bt!==at)return bt.localeCompare(at);return (Number(b?.rowNumber)||0)-(Number(a?.rowNumber)||0);});if(!r.patients.length){$('status').textContent=r.todayAppointmentFound===false?`No today's appointment found for ${U.phone($('wa').value)} in ${$('city').value}.`:`No patient with a booked EEG appointment was found for this WhatsApp number in ${$('city').value} for today.`;$('status').style.color='#b42318';}else{$('status').textContent='';}r.patients.forEach(x=>{const b=document.createElement('button');b.className='patient-option';b.innerHTML=`<strong>${U.esc(x.name)}</strong><span class="patient-meta">${U.esc(x.age)} ${U.esc(x.ageUnit||'years')} • ${U.esc(x.city||'')} • ${U.date(x.date)}</span>`;b.onclick=()=>selectPatient(x,b);$('patients').appendChild(b)});if(r.patients.length===1){const b=$('patients').querySelector('.patient-option');selectPatient(r.patients[0],b)}}catch(e){$('status').textContent=e.message||'Unable to load patient details.'}finally{setLoading(false)}};
$('cash').oninput=updateTotal;$('online').oninput=updateTotal;
$('save').onclick=async()=>{
  if(!selected||$('save').disabled)return;
  const error=(message,fieldId)=>{ $('updateMessage').hidden=false; $('updateMessage').style.color='#b42318'; $('updateMessage').textContent=message; $(fieldId)?.focus(); return; };
  if(!String($('city').value||'').trim())return error('Please select the city.','city');
  const wa=U.phone($('wa').value);if(!/^[6-9]\d{9}$/.test(wa))return error('Enter a valid 10-digit WhatsApp number.','wa');
  const MAX=Number(NEURON_CONFIG.eegMax)||3000;
  let cash=null,online=null,total=0;const mode=$('paymentMode').value;
  if(mode!=='Split'){
    const raw=String($('amount').value??'').trim();
    if(raw==='')return error('EEG Charges field cannot be empty. Enter 0 if no charge was paid.','amount');
    const v=Number(raw);if(!Number.isFinite(v)||v<0||v>MAX)return error(`EEG charges must be between ₹0 and ₹${MAX}.`,'amount');
    total=v;cash=mode==='Cash'?v:null;online=mode==='Online'?v:null;
  }else{
    const cr=String($('cash').value??'').trim(),or=String($('online').value??'').trim();
    if(cr==='')return error('Paid in Cash field cannot be empty. Enter an amount greater than ₹0.','cash');
    if(or==='')return error('Paid Online field cannot be empty. Enter an amount greater than ₹0.','online');
    cash=Number(cr);online=Number(or);
    if(!Number.isFinite(cash)||cash<=0||cash>MAX)return error(`Paid in Cash must be greater than ₹0 and at most ₹${MAX}.`,'cash');
    if(!Number.isFinite(online)||online<=0||online>MAX)return error(`Paid Online must be greater than ₹0 and at most ₹${MAX}.`,'online');
    total=cash+online;if(total>MAX)return error(`Combined EEG charges cannot exceed ₹${MAX}.`,'cash');
  }
  const noChanges=Number(total)===Number(selected.eegCharges||0)&&Number(cash??0)===Number(selected.eegCashPaid||0)&&Number(online??0)===Number(selected.eegOnlinePaid||0);
  if(noChanges){
    $('updateMessage').hidden=false;
    $('updateMessage').style.color='#b42318';
    $('updateMessage').textContent='No changes were made. Update was not done';
    return;
  }
  $('updateMessage').style.color='';$('updateMessage').hidden=false;$('updateMessage').textContent='Wait we are updating EEG details to system...';
  const before={eegCharges:selected.eegCharges,eegCashPaid:selected.eegCashPaid,eegOnlinePaid:selected.eegOnlinePaid};
  const writeCash=cash,writeOnline=online;
  const p={appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city||$('city').value,whatsapp:selected.whatsapp||wa,whatsappNew:selected.whatsapp||wa,name:selected.name,age:Number(selected.age),ageUnit:selected.ageUnit,address:selected.address||'',referredBy:selected.referredBy||'',eegCharges:total,eegPaymentMode:mode,eegCashPaid:writeCash,eegOnlinePaid:writeOnline};
  $('save').disabled=true;$('save').textContent='Updating...';$('save').className='btn btn-primary loading-state';
  const tx={id:eegUpdateTxId_(p),type:"EEG_UPDATE",status:"pending",startedAt:Date.now(),timeoutMs:20000,payload:p};
  try{try{await IDB.put('tx',tx);}catch(_){} const r=await NeuronAPI.call('updateEEGDetails',p,20000);try{await IDB.updateTodayOPDFromMutation_({kind:"EEG_UPDATE",result:r,payload:p});}catch(_){}window.NeuronPatientActionContext?.notify?.("UPDATE_EEG");try{await IDB.put('tx',{...tx,status:"complete",result:r,completedAt:Date.now()});}catch(_){} const after={eegCharges:total,eegCashPaid:writeCash,eegOnlinePaid:writeOnline};const changes=[];const add=(label,a,b)=>{if(String(a??'')!==String(b??''))changes.push(`<div class="confirm-row"><span>${U.esc(label)}</span><b>${U.esc(String(a??''))} → ${U.esc(String(b??''))}</b></div>`)};add('Payment Mode',inferMode(before.eegCashPaid,before.eegOnlinePaid),inferMode(after.eegCashPaid,after.eegOnlinePaid));add('EEG Charges',before.eegCharges,after.eegCharges);add('Paid in Cash',before.eegCashPaid,after.eegCashPaid);add('Paid Online',before.eegOnlinePaid,after.eegOnlinePaid);$('confirmation').hidden=false;$('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Details Updated</h2><p>Appointment ID: <b>${U.esc(r.appointmentId||selected.appointmentId)}</b></p>${changes.length?'<p><b>Changed values</b></p>'+changes.join(''):'<p>No values were changed.</p>'}</div>`;selected.eegCharges=after.eegCharges;selected.eegCashPaid=after.eegCashPaid;selected.eegOnlinePaid=after.eegOnlinePaid;originalPayment={cash:Number(after.eegCashPaid)||0,online:Number(after.eegOnlinePaid)||0};selected=null;$('patients').innerHTML='';$('edit').hidden=true;$('name').value='';$('age').value='';$('amount').value='';$('cash').value='';$('online').value='';$('total').textContent='Total Amount Paid: ₹0'}catch(e){if(isUncertainMutationError_(e)){recoverUncertainMutation_(tx);$('updateMessage').hidden=false;$('updateMessage').style.color='#8a4b00';$('updateMessage').textContent='Unable to confirm the update. Recovery has started automatically.';}else{try{await IDB.put('tx',{...tx,status:'failed',failedAt:Date.now(),failureReason:String(e?.message||e||'')});}catch(_){} $('updateMessage').hidden=false;$('updateMessage').style.color='#b42318';$('updateMessage').textContent=e.message||'Unable to update EEG details. Please try again.'}}finally{$('save').disabled=false;$('save').textContent='Update EEG Details';$('save').className='cta'}};

  const patientActionContext=window.NeuronPatientActionContext?.read?.();
  if(new URLSearchParams(location.search).get("patientAction")==="1" && patientActionContext?.patient){
    const cp=patientActionContext.patient;
    if(cp.city && NEURON_CONFIG.cities.includes(String(cp.city))) $("city").value=String(cp.city);
    $("wa").value=String(cp.whatsapp||"").replace(/\D/g,"").slice(-10);
    clearState();
    selectPatient(cp,null);
  }

});
