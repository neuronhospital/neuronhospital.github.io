// Active OPD Update controller moved from opd_update.html inline code
// v117.4.12

document.addEventListener("DOMContentLoaded",()=>{
 const isOPD=true;let selected=null;
 const clearLoadedState=()=>{selected=null;$('patients').innerHTML="";$('edit').hidden=true;$('confirmation').hidden=true;$('confirmation').innerHTML="";$('status').textContent="";$('loadStatus').hidden=true;$('saveStatus').hidden=true;$('saveStatus').textContent="";setRefundChargeLock(false);};
 const setLoadBusy=(busy)=>{$('load').disabled=busy;$('load').textContent=busy?"Loading...":"Load";$('load').classList.toggle("opd-loading-btn",busy);};
 const setSaveBusy=(busy)=>{$('save').disabled=busy;$('save').textContent=busy?"Updating...":"Update OPD Details";$('save').classList.toggle("opd-updating-btn",busy);};
 const paymentMode=()=>{const c=Number($('cash').dataset.actual||0),o=Number($('online').dataset.actual||0);if(c>0&&o>0)return "Split";if(o>0)return "Online";return "Cash";};
 const refreshPaymentUI=()=>{const mode=paymentMode();const c=Number($('cash').value)||0,o=Number($('online').value)||0;$('chargeField').hidden=mode==="Split";$('splitCashField').hidden=mode!=="Split";$('splitOnlineField').hidden=mode!=="Split";$('splitTotalField').hidden=mode!=="Split";$('chargeLabel').textContent=mode==="Cash"?"OPD Charges Paid in Cash":mode==="Online"?"OPD Charges Paid Online":"OPD Charges Paid in Split";if(mode==="Split")$('totalPaid').textContent=(c+o).toFixed(2).replace(/\.00$/,'');};
 const setRefundChargeLock=(locked)=>{['charge','cash','online'].forEach(id=>{const el=$(id);if(!el)return;el.readOnly=locked;el.classList.toggle('refund-locked-field',locked);el.setAttribute('aria-readonly',locked?'true':'false');});['chargeField','splitCashField','splitOnlineField'].forEach(id=>{const wrap=$(id);if(wrap)wrap.classList.toggle('refund-locked-wrap',locked);});};
 const showChargeLock=()=>{const m=$('chargeLockModal'),d=$('chargeLockDialog');if(!m)return;m.hidden=false;d?.focus();};
 const hideChargeLock=()=>{const m=$('chargeLockModal');if(m)m.hidden=true;};
 $('chargeLockOk')?.addEventListener('click',hideChargeLock);
 $('chargeLockModal')?.addEventListener('click',e=>{if(e.target===$('chargeLockModal'))hideChargeLock();});
 ['charge','cash','online'].forEach(id=>$(id)?.addEventListener('click',e=>{if(e.currentTarget.readOnly)showChargeLock();}));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('chargeLockModal')?.hidden)hideChargeLock();});
 const renderPatient=(x,b)=>{selected=x;document.querySelectorAll('.patient-option').forEach(z=>z.classList.remove('selected'));b.classList.add('selected');$('edit').hidden=false;$('confirmation').hidden=true;$('confirmation').innerHTML="";$('name').value=x.name||"";$('age').value=x.age??"";$('unit').value=x.ageUnit||"years";$('address').value=x.address||"";$('ref').value=x.referredBy||"";$('editWa').value=x.whatsapp||"";$('nextFollowupCity').innerHTML=NEURON_CONFIG.cities.map(c=>`<option value="${U.esc(c)}">${U.esc(c)}</option>`).join("");const followupCity=String(x.nextFollowupCity||"").trim();const cityExists=[...$('nextFollowupCity').options].some(o=>o.value===followupCity);$('nextFollowupCity').value=cityExists?followupCity:"";$('charge').value=Number(x.totalOPDCharges||0);$('cash').value=Number(x.opdCashPaid||0);$('online').value=Number(x.opdOnlinePaid||0);$('cash').dataset.actual=String(x.opdCashPaid??0);$('online').dataset.actual=String(x.opdOnlinePaid??0);refreshPaymentUI();setRefundChargeLock(x.opdRefundProvided===true);setTimeout(()=>$('edit').scrollIntoView({behavior:'smooth',block:'start'}),100);};
 $('city').innerHTML=NEURON_CONFIG.cities.map(x=>`<option>${U.esc(x)}</option>`).join("");
 const scheduledCity=window.Schedule?.cityAtNow?.(NEURON_CONFIG.cities)||"Latur";
 if(NEURON_CONFIG.cities.includes(scheduledCity)) $("city").value=scheduledCity;
 $('city').addEventListener("change",()=>{clearLoadedState();});
 $('load').onclick=async()=>{
   const loadCity=String($('city')?.value||"").trim();
   const loadPhone=U.phone($('wa')?.value||"");
   if(!loadCity){$('status').textContent="Please select the city.";$('status').style.color="#b42318";$('city').focus();return;}
   if(!/^[6-9]\d{9}$/.test(loadPhone)){$('status').textContent="Enter a valid 10-digit WhatsApp number.";$('status').style.color="#b42318";$('wa').focus();return;}
   clearLoadedState();setLoadBusy(true);$('loadStatus').hidden=false;$('loadStatus').className="status opd-loading";$('loadStatus').textContent="Wait we are Loading Today's OPD details from system...";try{const r=await NeuronAPI.call("getOPDUpdatePatients",{whatsapp:U.phone($('wa').value),city:$('city').value});const patients=[...(r.patients||[])].sort((a,b)=>{const at=Date.parse(a.bookingTimestamp||"");const bt=Date.parse(b.bookingTimestamp||"");if(Number.isFinite(at)&&Number.isFinite(bt)&&bt!==at)return bt-at;if(Number.isFinite(at)!==Number.isFinite(bt))return Number.isFinite(bt)?1:-1;return 0;});patients.forEach((x)=>{const b=document.createElement('button');b.className='patient-option';b.innerHTML=`<strong>${U.esc(x.name)}</strong><span class="patient-meta">${U.esc(x.age)} ${U.esc(x.ageUnit)} • ${U.esc(x.city||'')} • ${U.date(x.date)}</span>`;b.onclick=()=>renderPatient(x,b);$('patients').appendChild(b);});if(r.patients.length===1)renderPatient(r.patients[0],$('patients').firstElementChild);else if(!r.patients.length){$('status').textContent=r.todayAppointmentFound===false?`No today's appointment found for ${U.phone($('wa').value)} in ${$('city').value}.`:"No today's OPD patient found.";$('status').style.color='#b42318';}}catch(e){$('status').textContent=e.message||"Unable to load OPD details."}finally{setLoadBusy(false);$('loadStatus').hidden=true;}};
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
   let charge=0,cash=0,online=0;
   if(mode!=="Split"){
     if(chargeRaw==="")return focusError("OPD Charges field cannot be empty. Enter 0 if no charge was paid.",'charge');
     if(!Number.isFinite(chargeNum)||chargeNum<0||chargeNum>MAX_OPD_AMOUNT)return focusError(`OPD Charges must be between ₹0 and ₹${MAX_OPD_AMOUNT}.`,'charge');
     charge=chargeNum;
     cash=mode==="Cash"?charge:0;
     online=mode==="Online"?charge:0;
   }else{
     if(cashRaw==="")return focusError("Cash payment field cannot be empty. Enter 0 if no amount was paid in cash.",'cash');
     if(onlineRaw==="")return focusError("Online payment field cannot be empty. Enter 0 if no amount was paid online.",'online');
     if(!Number.isFinite(cashNum)||cashNum<0||cashNum>MAX_OPD_AMOUNT)return focusError(`Cash amount must be between ₹0 and ₹${MAX_OPD_AMOUNT}.`,'cash');
     if(!Number.isFinite(onlineNum)||onlineNum<0||onlineNum>MAX_OPD_AMOUNT)return focusError(`Online amount must be between ₹0 and ₹${MAX_OPD_AMOUNT}.`,'online');
     cash=cashNum;online=onlineNum;charge=cash+online;
     if(charge>MAX_OPD_AMOUNT)return focusError(`Combined Cash + Online amount cannot exceed ₹${MAX_OPD_AMOUNT}.`,'cash');
   }

   setSaveBusy(true);$('saveStatus').hidden=false;$('saveStatus').className="status opd-loading";$('saveStatus').style.color="";$('saveStatus').textContent="Wait we are updating OPD details to system...";
   const p={appointmentId:selected.appointmentId,rowNumber:selected.rowNumber,city:selected.city,whatsapp:selected.whatsapp,whatsappNew:newPhone,name:U.title($('name').value),age:age,ageUnit:$('unit').value,address:U.title($('address').value),referredBy:U.title($('ref').value),nextFollowupCity:$('nextFollowupCity').value,opdCharges:charge,opdPaymentMode:mode,opdCashPaid:cash,opdOnlinePaid:online};
   try{const r=await NeuronAPI.call("updateOPDDetails",p,25000);const before=r.before||{},after=r.after||{};const fields=[['Patient Name',before.name,after.name],['Age',`${before.age} ${before.ageUnit}`,`${after.age} ${after.ageUnit}`],['Address',before.address,after.address],['Referred By Dr./Hospital',before.referredBy,after.referredBy],['WhatsApp Number',before.whatsapp,after.whatsapp],['Next Follow-up City',before.nextFollowupCity,after.nextFollowupCity],['OPD Charges Paid',before.opdTotalPaid,after.opdTotalPaid],['Paid in Cash',before.opdCashPaid,after.opdCashPaid],['Paid Online',before.opdOnlinePaid,after.opdOnlinePaid]];const changed=fields.filter(f=>String(f[1]??"")!==String(f[2]??""));$('confirmation').hidden=false;$('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Details Updated</h2><p>Appointment ID: <b>${U.esc(r.appointmentId)}</b></p>${changed.length?`<p><b>Changed and updated:</b></p><ul class="changed-list">${changed.map(f=>`<li><b>${U.esc(f[0])}</b>: ${U.esc(String(f[1]??""))} → <b>${U.esc(String(f[2]??""))}</b></li>`).join('')}</ul>`:`<p>No values were changed.</p>`}</div>`;selected=null;$('patients').innerHTML="";$('edit').hidden=true;$('name').value="";$('age').value="";$('address').value="";$('ref').value="";$('editWa').value="";$('nextFollowupCity').innerHTML="";$('charge').value="";$('cash').value="";$('online').value="";$('cash').dataset.actual="";$('online').dataset.actual="";$('totalPaid').textContent="0";}catch(e){$('saveStatus').hidden=false;$('saveStatus').style.color='#b42318';$('saveStatus').textContent=e.message||"Unable to update OPD details.";}finally{setSaveBusy(false);}
 };

});
