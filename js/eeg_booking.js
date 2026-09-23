document.addEventListener("DOMContentLoaded",()=>{
  const $=U.$,cities=NEURON_CONFIG.cities;
  let sel=null;

  $('city').innerHTML=cities.map(x=>`<option>${x}</option>`).join('');
  $('city').value=window.DailyCity?.get?.()|| (window.Schedule?.cityAtNow?Schedule.cityAtNow(cities):'Latur');

  function def(){return $('city').value==='Latur'?1100:1600}

  function setPaymentDefaults(){
    const v=def();
    $('amount').value=v;
    $('cash').value='';
    $('online').value='';
    $('total').textContent='₹0';
  }

  function updatePayment(){
    const m=$('mode').value;
    if(m==='Split'){
      $('singlePayment').hidden=true;
      $('split').hidden=false;
      $('cash').value='';
      $('online').value='';
      $('total').textContent='₹0';
    }else{
      $('singlePayment').hidden=false;
      $('split').hidden=true;
      $('singlePaymentLabel').textContent=m;

      // Clear previous split values when switching to Cash/Online
      $('cash').value='';
      $('online').value='';
      $('total').textContent='₹0';

      $('amount').value=def();
    }
  }

  function resetBookButton(){
    $('book').disabled=false;
    $('book').textContent='Book EEG Appointment';
    $('book').className='cta';
  }

  const applyRecoveryPrefill=()=>{
    let r=null;
    try{r=JSON.parse(localStorage.getItem("neuronRecoveryPrefillV1")||"null")}catch(_){r=null}
    if(!r||r.type!=="EEG_BOOKING")return;
    const p=r.payload||{};
    if(p.city&&cities.includes(String(p.city)))$('city').value=String(p.city);
    if(p.whatsapp)$('wa').value=String(p.whatsapp).replace(/\D/g,"").slice(-10);
    try{localStorage.removeItem("neuronRecoveryPrefillV1")}catch(_){}
    $('status').textContent="Patient WhatsApp and city pre-filled from the failed recovery. Please load the patient, review the details and submit a new EEG booking.";
    $('status').style.color='#7b1fa2';
  };
  applyRecoveryPrefill();


  function clearLoadedState(){
    sel=null;
    $('confirmation').hidden=true;
    $('confirmation').innerHTML='';
    $('patients').innerHTML='';
    $('payment').hidden=true;
    $('cash').value='';
    $('online').value='';
    $('total').textContent='₹0';
    $('status').textContent='';
    resetBookButton();
  }

  $('mode').onchange=updatePayment;
  $('cash').oninput=()=>{$('total').textContent='₹'+((Number($('cash').value)||0)+(Number($('online').value)||0))};
  $('online').oninput=()=>{$('total').textContent='₹'+((Number($('cash').value)||0)+(Number($('online').value)||0))};

  $('city').onchange=()=>{
    clearLoadedState();
    $('bookMessage').hidden=true;
    $('bookMessage').textContent='Wait we are Confirming your EEG Booking...';
  };

  $('wa').addEventListener('input',()=>{
    const wa=$('wa').value.trim();
    const msg=document.getElementById('waError');
    if(msg && /^[6789]\d{9}$/.test(wa)){
      msg.textContent='';
    }
  });

  $('load').onclick=async()=>{
    if($('load').disabled)return;
    if(!String($('city').value||'').trim()){ $('status').textContent='Please select the city.'; $('status').style.color='#b42318'; $('city').focus(); return; }
    const wa=$('wa').value.trim();
    if(!/^[6789]\d{9}$/.test(wa)){
      let msg=document.getElementById('waError');
      if(!msg){
        msg=document.createElement('div');
        msg.id='waError';
        msg.style.color='red';
        $('wa').closest('.input-row').parentElement.appendChild(msg);
      }
      msg.textContent='Enter 10 digit number given at the time of OPD Booking';
      return;
    }
    let oldMsg=document.getElementById('waError');
    if(oldMsg) oldMsg.textContent='';
    clearLoadedState();
    $('bookMessage').hidden=true;
    $('load').disabled=true;
    $('load').textContent='Loading...';
    $('load').className='btn btn-primary';
    $('loadMessage').hidden=false;
    try{
      const r=await IDB.getTodayPatientsByWhatsApp_({whatsapp:U.phone($('wa').value),city:$('city').value});r.patients=(r.patients||[]).filter(p=>p.eegCharges===null||p.eegCharges===undefined||p.eegCharges==='');r.patients.sort((a,b)=>{const sa=Number(String(a?.appointmentId||"").match(/-(\d+)$/)?.[1]),sb=Number(String(b?.appointmentId||"").match(/-(\d+)$/)?.[1]);if(Number.isFinite(sa)&&Number.isFinite(sb)&&sa!==sb)return sb-sa;const at=String(a?.date||"")+String(a?.time||"");const bt=String(b?.date||"")+String(b?.time||"");if(bt!==at)return bt.localeCompare(at);return (Number(b?.rowNumber)||0)-(Number(a?.rowNumber)||0);});
      $('patients').innerHTML='';
      if(!r.patients.length){
        $('status').textContent = r.todayAppointmentFound===false
          ? `No today's appointment found for ${U.phone($('wa').value)} in ${$('city').value}.`
          : `No patient awaiting EEG booking was found for this WhatsApp number in ${$('city').value} for today.`;
        $('status').style.color='#b42318';
      }else{
        $('status').textContent='';
      }
      r.patients.forEach((x,i)=>{
        const b=document.createElement('button');
        b.className='patient-option';
        b.innerHTML=`<strong>${U.esc(x.name)}</strong><span class="patient-meta">${U.esc(x.age)} ${U.esc(x.ageUnit)} • ${U.esc(x.city||"")} • ${U.date(x.date)}</span>`;
        b.onclick=()=>{
          sel=x;
          $('confirmation').hidden=true;
          $('confirmation').innerHTML='';
          $('bookMessage').hidden=true;
          document.querySelectorAll('.patient-option').forEach(z=>z.classList.remove('selected'));
          b.classList.add('selected');
          $('payment').hidden=false;
          if($('paymentPatientName')) $('paymentPatientName').textContent=x.name||'';
          setPaymentDefaults();
          updatePayment();
          if($('paymentPatientName')){
            $('paymentPatientName').scrollIntoView({behavior:'smooth',block:'center'});
            $('paymentPatientName').focus();
          }else{
            $('payment').scrollIntoView({behavior:'smooth',block:'start'});
          }
        };
        $('patients').appendChild(b);
        if(r.patients.length===1)b.click();
      });
    }catch(e){$('status').textContent=e.message}
    finally{
      $('load').disabled=false;
      $('load').textContent='Load';
      $('load').className='btn btn-secondary';
      $('loadMessage').hidden=true;
    }
  };

  $('book').onclick=async()=>{
    if(!sel||$('book').disabled)return;
    const error=(message,fieldId)=>{ $('status').textContent=message; $('status').style.color='#b42318'; $(fieldId)?.focus(); return; };
    if(!String($('city').value||'').trim())return error('Please select the city.','city');
    const wa=U.phone($('wa').value);
    if(!/^[6-9]\d{9}$/.test(wa))return error('Enter a valid 10-digit WhatsApp number.','wa');
    if(await window.NeuronRecovery?.isPatientRecovering?.({name:sel.name,whatsapp:wa,city:$('city').value,appointmentDate:(()=>{const p=U.parts();return p.y+String(p.m).padStart(2,'0')+String(p.d).padStart(2,'0')})()})){
      return error(`${sel.name} has a pending appointment. The system is recovering the appointment status. Please wait for the recovery status to update before booking this patient again.`);
    }
    const m=String($('mode').value||'').trim();
    if(!['Cash','Online','Split'].includes(m))return error('Please select a valid payment mode.','mode');
    const MAX=Number(NEURON_CONFIG.eegMax)||3000;
    const amountRaw=String($('amount').value??'').trim();
    const cashRaw=String($('cash').value??'').trim();
    const onlineRaw=String($('online').value??'').trim();
    const amount=amountRaw===''?NaN:Number(amountRaw),cash=cashRaw===''?NaN:Number(cashRaw),online=onlineRaw===''?NaN:Number(onlineRaw);
    let total=0,cPaid=0,oPaid=0;
    if(m==='Cash'){
      if(amountRaw==='')return error('Please enter the cash amount.','amount');
      if(!Number.isFinite(amount)||amount<0||amount>MAX)return error(`Cash amount must be between ₹0 and ₹${MAX}.`,'amount');
      total=amount;cPaid=amount;
    }else if(m==='Online'){
      if(amountRaw==='')return error('Please enter the online amount.','amount');
      if(!Number.isFinite(amount)||amount<=0||amount>MAX)return error(`Online amount must be more than ₹0 and no more than ₹${MAX}.`,'amount');
      total=amount;oPaid=amount;
    }else{
      if(cashRaw==='')return error('Please enter the cash amount.','cash');
      if(onlineRaw==='')return error('Please enter the online amount.','online');
      if(!Number.isFinite(cash)||cash<=0||cash>MAX)return error(`Cash amount must be more than ₹0 and no more than ₹${MAX}.`,'cash');
      if(!Number.isFinite(online)||online<=0||online>MAX)return error(`Online amount must be more than ₹0 and no more than ₹${MAX}.`,'online');
      total=cash+online;cPaid=cash;oPaid=online;
      if(total<=0||total>MAX)return error(`Combined amount must be more than ₹0 and no more than ₹${MAX}.`,'cash');
    }
    $('status').textContent='';
    $('book').disabled=true;
    $('book').textContent='Confirming EEG Booking...';
    $('book').className='btn btn-success';
    $('bookMessage').hidden=false;
    $('bookMessage').textContent='Wait we are Confirming your EEG Booking...';
    const id=U.requestId8(),startedAt=Date.now(),timeoutMs=15000,p={eegBookingRequestId:id,bookingRequestId:sel.bookingRequestId||"",appointmentId:sel.appointmentId,rowNumber:sel.rowNumber,patientName:sel.name,whatsapp:wa,city:$('city').value,eegCharges:total,eegPaymentMode:m,eegCashPaid:cPaid,eegOnlinePaid:oPaid};
    try{
      try{await IDB.put('tx',{id,type:'EEG_BOOKING',status:'pending',startedAt,timeoutMs,payload:p});}catch(_){}
      const r=await NeuronAPI.call('bookEEG',p,timeoutMs);
      try{await IDB.put('tx',{id,type:'EEG_BOOKING',status:'complete',payload:p,result:r});}catch(_){}
      await window.syncSuccessfulBookingToTodayCaches_?.({kind:'EEG_BOOKING',appointmentId:r.appointmentId||p.appointmentId,date:r.date||sel.date||(()=>{const q=U.parts();return q.y+String(q.m).padStart(2,'0')+String(q.d).padStart(2,'0')})(),time:r.time||sel.time||'',patientName:r.patientName||sel.name,age:r.age??sel.age,ageUnit:r.ageUnit||sel.ageUnit,address:r.address??sel.address,patientType:r.patientType||sel.patientType,whatsapp:p.whatsapp,city:r.city||p.city,referredBy:r.referredBy??sel.referredBy,nextFollowupCity:r.nextFollowupCity??sel.nextFollowupCity,bookingRequestId:p.bookingRequestId,eegCharges:r.eegCharges??p.eegCharges,eegCashPaid:r.eegCashPaid??p.eegCashPaid,eegOnlinePaid:r.eegOnlinePaid??p.eegOnlinePaid,eegTotalPaid:r.eegTotalPaid??p.eegCharges,eegBookingRequestId:r.eegBookingRequestId||id});
      const confirmationPatient=r.patientName||sel.name;
      window.NeuronPatientActionContext?.notify?.("BOOK_EEG");
      $('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Appointment Confirmed</h2><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(confirmationPatient)}</b></div><div class="confirm-row"><span>EEG Charges</span><b>${U.money(r.eegCharges)}</b></div></div>`;
      $('patients').innerHTML='';sel=null;$('payment').hidden=true;$('paymentPatientName').textContent='';$('amount').value='';$('cash').value='';$('online').value='';$('total').textContent='₹0';$('status').textContent='';$('confirmation').hidden=false;resetBookButton();
    }catch(e){
      try{await IDB.put('tx',{id,type:'EEG_BOOKING',status:'uncertain',payload:p});}catch(_){}
      try{window.NeuronRecovery?.reconcilePendingBookings?.();}catch(_){}
      // Global Recovery Manager is authoritative for the recovery status UI.
      $('confirmation').hidden=true;
      $('confirmation').innerHTML='';
      $('book').disabled=false;
      $('book').textContent='Book EEG Appointment';
      $('book').className='cta';
    }
  };

  const patientActionContext=window.NeuronPatientActionContext?.read?.();
  if(new URLSearchParams(location.search).get("patientAction")==="1" && patientActionContext?.patient){
    const cp=patientActionContext.patient;
    if(cp.city && cities.includes(String(cp.city))) $("city").value=String(cp.city);
    $("wa").value=String(cp.whatsapp||"").replace(/\D/g,"").slice(-10);
    clearLoadedState();
    sel=cp;
    $('confirmation').hidden=true; $('confirmation').innerHTML=''; $('bookMessage').hidden=true;
    $('payment').hidden=false; if($('paymentPatientName'))$('paymentPatientName').textContent=cp.name||'';
    setPaymentDefaults(); updatePayment();
  }

});
