// Active OPD Update controller moved from opd_update.html inline code
// v117.4.12

function opdUpdateTxId_(p){return `OPD_UPDATE|${String(p.appointmentId||"")}|${Number(p.rowNumber)||0}|${Date.now()}|${Math.random().toString(36).slice(2,8)}`;}
function isUncertainMutationError_(e){const m=String(e?.message||e||"");return /Network timeout|request may still have been recorded|You are offline|Failed to fetch|NetworkError|fetch failed/i.test(m)||e?.name==="TypeError";}
function recoverUncertainMutation_(tx){try{void IDB.put("tx",{...tx,status:"uncertain",uncertainAt:Date.now()}).then(()=>window.NeuronRecovery?.reconcilePendingBookings?.()).catch(()=>{});}catch(_){} }

document.addEventListener("DOMContentLoaded",()=>{
 const isOPD=true;let selected=null;
 const clearLoadedState=()=>{selected=null;$('patients').innerHTML="";$('edit').hidden=true;$('confirmation').hidden=true;$('confirmation').innerHTML="";$('status').textContent="";$('loadStatus').hidden=true;$('saveStatus').hidden=true;$('saveStatus').textContent="";setRefundChargeLock(false);};
 const setLoadBusy=(busy)=>{$('load').disabled=busy;$('load').textContent=busy?"Loading...":"Load";$('load').classList.toggle("opd-loading-btn",busy);};
 const setSaveBusy=(busy)=>{$('save').disabled=busy;$('save').textContent=busy?"Updating...":"Update OPD Details";$('save').classList.toggle("opd-updating-btn",busy);};
 const paymentMode=()=>String($('paymentMode')?.value||"Cash");
 // Confirmation-box display of payment changes.
 const confirmationPaymentFields_=(beforeCash,afterCash,beforeOnline,afterOnline)=>{
   const c=Number(afterCash)||0,o=Number(afterOnline)||0;
   const cashChanged=String(beforeCash??"")!==String(afterCash??"");
   const onlineChanged=String(beforeOnline??"")!==String(afterOnline??"");
   if(!cashChanged&&!onlineChanged)return [];
   const fields=[];
   if(c>=0&&o===0)fields.push(['Paid in Cash',beforeCash,afterCash]);
   else if(c===0&&o>0)fields.push(['Paid Online',beforeOnline,afterOnline]);
   else if(c>0&&o>0){
     fields.push(['Paid in Cash',beforeCash,afterCash],['Paid Online',beforeOnline,afterOnline]);
   }
   return fields;
 };

 const paymentModeFromValues_=(cash,online)=>{const c=Number(cash)||0,o=Number(online)||0;return c>0&&o>0?"Split":o>0?"Online":"Cash";};
 const refreshPaymentUI=()=>{const mode=paymentMode();$('chargeField').hidden=mode==="Split";$('splitCashField').hidden=mode!=="Split";$('splitOnlineField').hidden=mode!=="Split";$('splitTotalField').hidden=mode!=="Split";$('chargeLabel').textContent=mode==="Cash"?"OPD Charges Paid in Cash":mode==="Online"?"OPD Charges Paid Online":"OPD Charges Paid in Split";if(mode==="Split")$('totalPaid').textContent=((Number($('cash').value)||0)+(Number($('online').value)||0)).toFixed(2).replace(/\.00$/,'');};
 const setRefundChargeLock=(locked)=>{['charge','cash','online'].forEach(id=>{const el=$(id);if(!el)return;el.readOnly=locked;el.classList.toggle('refund-locked-field',locked);el.setAttribute('aria-readonly',locked?'true':'false');});const modeEl=$('paymentMode');if(modeEl){modeEl.disabled=locked;modeEl.classList.toggle('refund-locked-field',locked);modeEl.setAttribute('aria-disabled',locked?'true':'false');}['chargeField','splitCashField','splitOnlineField'].forEach(id=>{const wrap=$(id);if(wrap)wrap.classList.toggle('refund-locked-wrap',locked);});};
 const showChargeLock=()=>{const m=$('chargeLockModal'),d=$('chargeLockDialog');if(!m)return;m.hidden=false;d?.focus();};
 const hideChargeLock=()=>{const m=$('chargeLockModal');if(m)m.hidden=true;};
 $('chargeLockOk')?.addEventListener('click',hideChargeLock);
 $('chargeLockModal')?.addEventListener('click',e=>{if(e.target===$('chargeLockModal'))hideChargeLock();});
 ['charge','cash','online'].forEach(id=>$(id)?.addEventListener('click',e=>{if(e.currentTarget.readOnly)showChargeLock();}));$('paymentMode')?.addEventListener('mousedown',e=>{if(e.currentTarget.disabled){e.preventDefault();showChargeLock();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chargeLockModal')?.hidden)hideChargeLock();});
 const renderPatient=(x,b)=>{selected=x;document.querySelectorAll('.patient-option').forEach(z=>z.classList.remove('selected'));b?.classList.add('selected');$('edit').hidden=false;$('confirmation').hidden=true;$('confirmation').innerHTML="";$('name').value=x.name||"";$('age').value=x.age??"";$('unit').value=x.ageUnit||"years";$('address').value=x.address||"";$('ref').value=x.referredBy||"";$('editWa').value=x.whatsapp||"";$('nextFollowupCity').innerHTML=NEURON_CONFIG.cities.map(c=>`<option value="${U.esc(c)}">${U.esc(c)}</option>`).join("");const followupCity=String(x.nextFollowupCity||"").trim();const cityExists=[...$('nextFollowupCity').options].some(o=>o.value===followupCity);$('nextFollowupCity').value=cityExists?followupCity:"";const c=Number(x.opdCashPaid)||0,o=Number(x.opdOnlinePaid)||0;const mode=c>0&&o>0?'Split':o>0?'Online':'Cash';$('paymentMode').value=mode;previousPaymentMode=mode;$('charge').value=Number(x.totalOPDCharges||0);$('cash').value=c||'';$('online').value=o||'';refreshPaymentUI();setRefundChargeLock(x.opdRefundProvided===true);setTimeout(()=>$('edit').scrollIntoView({behavior:'smooth',block:'start'}),100);};
 let previousPaymentMode='Cash';
 ['cash','online'].forEach(id=>$(id)?.addEventListener('input',()=>{if(paymentMode()==='Split')refreshPaymentUI();}));
 $('paymentMode').addEventListener('change',()=>{const nextMode=paymentMode();const previousMode=previousPaymentMode;const total=previousMode==='Split'?((Number($('cash').value)||0)+(Number($('online').value)||0)):Number($('charge').value)||0;if(nextMode==='Split'){if(previousMode==='Cash'){$('cash').value=total||'';$('online').value='';}else if(previousMode==='Online'){$('cash').value='';$('online').value=total||'';}else{$('cash').value=Number($('cash').value)||'';$('online').value=Number($('online').value)||'';}}else{$('charge').value=total||'';$('cash').value=nextMode==='Cash'?(total||''):'';$('online').value=nextMode==='Online'?(total||''):'';}previousPaymentMode=nextMode;refreshPaymentUI();});
 $('city').innerHTML=NEURON_CONFIG.cities.map(x=>`<option>${U.esc(x)}</option>`).join("");
 const defaultCity=window.DailyCity?.get?.()||window.Schedule?.cityAtNow?.(NEURON_CONFIG.cities)||"Latur";
 if(NEURON_CONFIG.cities.includes(defaultCity)) $("city").value=defaultCity;
 $('city').addEventListener("change",()=>{clearLoadedState();});
 $('load').onclick=async()=>{
   const loadCity=String($('city')?.value||"").trim();
   const loadPhone=U.phone($('wa')?.value||"");
   if(!loadCity){$('status').textContent="Please select the city.";$('status').style.color="#b42318";$('city').focus();return;}
   if(!/^[6-9]\d{9}$/.test(loadPhone)){$('status').textContent="Enter a valid 10-digit WhatsApp number.";$('status').style.color="#b42318";$('wa').focus();return;}
   clearLoadedState();setLoadBusy(true);$('loadStatus').hidden=false;$('loadStatus').className="status opd-loading";$('loadStatus').textContent="Wait we are Loading Today's OPD details from system...";try{const r=await IDB.getTodayPatientsByWhatsApp_({whatsapp:U.phone($('wa').value),city:$('city').value});const patients=[...(r.patients||[])].sort((a,b)=>{const sa=Number(String(a?.appointmentId||"").match(/-(\d+)$/)?.[1]),sb=Number(String(b?.appointmentId||"").match(/-(\d+)$/)?.[1]);if(Number.isFinite(sa)&&Number.isFinite(sb)&&sa!==sb)return sb-sa;const at=String(a?.date||"")+String(a?.time||"");const bt=String(b?.date||"")+String(b?.time||"");if(bt!==at)return bt.localeCompare(at);return (Number(b?.rowNumber)||0)-(Number(a?.rowNumber)||0);});patients.forEach((x)=>{const b=document.createElement('button');b.className='patient-option';b.innerHTML=`<strong>${U.esc(x.name)}</strong><span class="patient-meta">${U.esc(x.age)} ${U.esc(x.ageUnit)} • ${U.esc(x.city||'')} • ${U.date(x.date)}</span>`;b.onclick=()=>renderPatient(x,b);$('patients').appendChild(b);});if(r.patients.length===1)renderPatient(r.patients[0],$('patients').firstElementChild);else if(!r.patients.length){$('status').textContent=r.todayAppointmentFound===false?`No today's appointment found for ${U.phone($('wa').value)} in ${$('city').value}.`:"No today's OPD patient found.";$('status').style.color='#b42318';}}catch(e){$('status').textContent=e.message||"Unable to load OPD details."}finally{setLoadBusy(false);$('loadStatus').hidden=true;}};
 $('save').onclick=async()=>{
   if(!selected||$('save').disabled)return;
   const focusError=(message,fieldId)=>{
     $('saveStatus').hidden=false;
     $('saveStatus').className="status";
     $('saveStatus').style.color="#b42318";
     $('saveStatus').textContent=message;
     $(fieldId)?.focus();
     return false;
   };
   const required=[
     ["name","Please enter the patient's name."],
     ["age","Please enter the patient's age."],
     ["address","Please enter the patient's address."],
     ["editWa","Please enter the correct WhatsApp number."],
     ["nextFollowupCity","Please select the next follow-up city."]
   ];
   for(const [id,msg] of required){
     if(!String($(id)?.value||"").trim())return focusError(msg,id);
   }
   const age=Number($('age').value);
   if(!Number.isFinite(age)||age<=0)return focusError("Please enter a valid age.",'age');
   const newPhone=U.phone($('editWa').value);
   if(!/^[6-9]\d{9}$/.test(newPhone))return focusError("Enter a valid 10-digit WhatsApp number.",'editWa');

   const mode=paymentMode(),MAX_OPD_AMOUNT=2000;
   const chargeRaw=String($('charge')?.value??"").trim();
   const cashRaw=String($('cash')?.value??"").trim();
   const onlineRaw=String($('online')?.value??"").trim();
   const chargeNum=chargeRaw===""?NaN:Number(chargeRaw);
   const cashNum=cashRaw===""?NaN:Number(cashRaw);
   const onlineNum=onlineRaw===""?NaN:Number(onlineRaw);
   let charge=0,cash=null,online=null;
   if(mode!=="Split"){
     if(chargeRaw==="")return focusError("OPD Charges field cannot be empty. Enter 0 if no charge was paid.",'charge');
     if(!Number.isFinite(chargeNum)||chargeNum<0||chargeNum>MAX_OPD_AMOUNT)return focusError(`OPD Charges must be between ₹0 and ₹${MAX_OPD_AMOUNT}.`,'charge');
     charge=chargeNum;
     cash=mode==="Cash"?charge:null;
     online=mode==="Online"?charge:null;
   }else{
     if(cashRaw==="")return focusError("Cash payment field cannot be empty.",'cash');
     if(onlineRaw==="")return focusError("Online payment field cannot be empty.",'online');
     if(!Number.isFinite(cashNum)||cashNum<=0||cashNum>=MAX_OPD_AMOUNT)return focusError(`Cash amount must be greater than ₹0 and less than ₹${MAX_OPD_AMOUNT}.`,'cash');
     if(!Number.isFinite(onlineNum)||onlineNum<=0||onlineNum>=MAX_OPD_AMOUNT)return focusError(`Online amount must be greater than ₹0 and less than ₹${MAX_OPD_AMOUNT}.`,'online');
     cash=cashNum;online=onlineNum;charge=cash+online;
     if(charge>MAX_OPD_AMOUNT)return focusError(`Combined Cash + Online amount cannot exceed ₹${MAX_OPD_AMOUNT}.`,'cash');
   }

   const sameText=(a,b)=>String(a??"").trim()===String(b??"").trim();
   const samePhone=(a,b)=>U.phone(a)===U.phone(b);
   const sameNumber=(a,b)=>Number(a??0)===Number(b??0);
   const proposedName=U.title($('name').value);
   const proposedAddress=U.title($('address').value);
   const proposedReferredBy=U.title($('ref').value);
   const proposedFollowupCity=String($('nextFollowupCity').value??"").trim();
   const noChanges=sameText(proposedName,selected.name)&&
     sameNumber(age,selected.age)&&
     sameText($('unit').value,selected.ageUnit)&&
     sameText(proposedAddress,selected.address)&&
     sameText(proposedReferredBy,selected.referredBy)&&
     samePhone(newPhone,selected.whatsapp)&&
     sameText(proposedFollowupCity,selected.nextFollowupCity)&&
     sameNumber(charge,selected.totalOPDCharges)&&
     sameNumber(cash,selected.opdCashPaid)&&
     sameNumber(online,selected.opdOnlinePaid);
   if(noChanges){
     $('saveStatus').hidden=false;
     $('saveStatus').className="status";
     $('saveStatus').style.color="#b42318";
     $('saveStatus').textContent="No changes were made. Update was not done";
     return;
   }

   setSaveBusy(true);$('saveStatus').hidden=false;$('saveStatus').className="status opd-loading";$('saveStatus').style.color="";$('saveStatus').textContent="Wait we are updating OPD details to system...";
   const p={appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city,visitingCity:selected.city,whatsapp:selected.whatsapp,whatsappNew:newPhone,name:proposedName,age:age,ageUnit:$('unit').value,address:proposedAddress,patientType:selected.patientType||'Follow-up',referredBy:proposedReferredBy,nextFollowupCity:proposedFollowupCity,opdCharges:charge,opdPaymentMode:mode,opdCashPaid:cash,opdOnlinePaid:online};
   const tx={id:opdUpdateTxId_(p),type:"OPD_UPDATE",status:"pending",startedAt:Date.now(),timeoutMs:20000,payload:p};
   try{try{await IDB.put("tx",tx);}catch(_){} const r=await NeuronAPI.call("updateOPDDetails",p,20000);try{await IDB.updateTodayOPDFromMutation_({kind:"OPD_UPDATE",result:r,payload:p});}catch(_){}window.NeuronPatientActionContext?.notify?.("OPD_UPDATE");try{await IDB.put("tx",{...tx,status:"complete",result:r,completedAt:Date.now()});}catch(_){} const before={name:selected.name,age:selected.age,ageUnit:selected.ageUnit,address:selected.address,referredBy:selected.referredBy,whatsapp:selected.whatsapp,nextFollowupCity:selected.nextFollowupCity,opdTotalPaid:selected.opdTotalPaid,opdCashPaid:selected.opdCashPaid,opdOnlinePaid:selected.opdOnlinePaid};const after={name:proposedName,age:age,ageUnit:$('unit').value,address:proposedAddress,referredBy:proposedReferredBy,whatsapp:newPhone,nextFollowupCity:proposedFollowupCity,opdTotalPaid:charge,opdCashPaid:cash,opdOnlinePaid:online};const baseFields=[['Patient Name',before.name,after.name],['Age',`${before.age} ${before.ageUnit}`,`${after.age} ${after.ageUnit}`],['Address',before.address,after.address],['Referred By Dr./Hospital',before.referredBy,after.referredBy],['WhatsApp Number',before.whatsapp,after.whatsapp],['Next Follow-up City',before.nextFollowupCity,after.nextFollowupCity]];const paymentChanged=String(before.opdTotalPaid??"")!==String(after.opdTotalPaid??"")||String(before.opdCashPaid??"")!==String(after.opdCashPaid??"")||String(before.opdOnlinePaid??"")!==String(after.opdOnlinePaid??"");const changed=baseFields.filter(f=>String(f[1]??"")!==String(f[2]??""));const paymentFields=paymentChanged?[['Payment Mode',paymentModeFromValues_(before.opdCashPaid,before.opdOnlinePaid),paymentModeFromValues_(after.opdCashPaid,after.opdOnlinePaid)],['OPD Charges Paid',before.opdTotalPaid,after.opdTotalPaid],...confirmationPaymentFields_(before.opdCashPaid,after.opdCashPaid,before.opdOnlinePaid,after.opdOnlinePaid)]:[];const allDisplayFields=[...changed,...paymentFields];$('confirmation').hidden=false;$('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Details Updated</h2><p>Appointment ID: <b>${U.esc(r.appointmentId)}</b></p>${allDisplayFields.length?`<p><b>Changed and updated:</b></p><ul class="changed-list">${allDisplayFields.map(f=>`<li><b>${U.esc(f[0])}</b>: ${U.esc(String(f[1]??""))} → <b>${U.esc(String(f[2]??""))}</b></li>`).join('')}</ul>`:`<p>No values were changed.</p>`}</div>`;selected=null;$('patients').innerHTML="";$('edit').hidden=true;$('name').value="";$('age').value="";$('address').value="";$('ref').value="";$('editWa').value="";$('nextFollowupCity').innerHTML="";$('charge').value="";$('cash').value="";$('online').value="";$('totalPaid').textContent="0";}catch(e){if(isUncertainMutationError_(e)){recoverUncertainMutation_(tx);$('saveStatus').hidden=false;$('saveStatus').style.color='#8a4b00';$('saveStatus').textContent='Unable to confirm the update. Recovery has started automatically.';}else{try{await IDB.put("tx",{...tx,status:"failed",failedAt:Date.now(),failureReason:String(e?.message||e||"")});}catch(_){} $('saveStatus').hidden=false;$('saveStatus').style.color='#b42318';$('saveStatus').textContent=e.message||"Unable to update OPD details.";}}finally{setSaveBusy(false);}
 };

  const patientActionContext=window.NeuronPatientActionContext?.read?.();
  if(new URLSearchParams(location.search).get("patientAction")==="1" && patientActionContext?.patient){
    const cp=patientActionContext.patient;
    if(cp.city && NEURON_CONFIG.cities.includes(String(cp.city))) $("city").value=String(cp.city);
    $("wa").value=String(cp.whatsapp||"").replace(/\D/g,"").slice(-10);
    clearLoadedState();
    renderPatient(cp,null);
  }

});
