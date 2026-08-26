document.addEventListener("DOMContentLoaded",()=>{
  const $=U.$,cities=NEURON_CONFIG.cities;
  let sel=null;

  $('city').innerHTML=cities.map(x=>`<option>${x}</option>`).join('');
  $('city').value=window.Schedule?.cityAtNow?Schedule.cityAtNow(cities):'Latur';

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
      $('amount').value=def();
    }
  }

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
  }

  $('mode').onchange=updatePayment;
  $('cash').oninput=()=>{$('total').textContent='₹'+((Number($('cash').value)||0)+(Number($('online').value)||0))};
  $('online').oninput=()=>{$('total').textContent='₹'+((Number($('cash').value)||0)+(Number($('online').value)||0))};

  $('city').onchange=()=>{
    clearLoadedState();
    $('bookMessage').hidden=true;
    $('bookMessage').textContent='Wait we are Confirming your EEG Booking...';
  };

  const waField = $('wa');
  if(waField){
    waField.oninput=()=>{
      let msg=document.getElementById('waError');
      const valid=/^[6789]\\d{9}$/.test(waField.value.trim());
      if(valid && msg) msg.remove();
    };
  }

  $('load').onclick=async()=>{
    if($('load').disabled)return;
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
      const r=await NeuronAPI.call('getEEGBookingPatientsByWhatsApp',{whatsapp:U.phone($('wa').value),city:$('city').value});
      $('patients').innerHTML='';
      r.patients.forEach((x,i)=>{
        const b=document.createElement('button');
        b.className='patient-option';
        b.innerHTML=`<b>${U.esc(x.name)}</b><small>${x.age} ${U.esc(x.ageUnit)} • ${U.date(x.date)}</small>`;
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
          $('payment').scrollIntoView({behavior:'smooth',block:'start'});
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
    const m=$('mode').value,
      c=m==='Cash'?Number($('amount').value)||0:m==='Online'?0:Number($('cash').value)||0,
      o=m==='Online'?Number($('amount').value)||0:Number($('online').value)||0,
      total=c+o;
    if(total>3000)return alert('EEG total cannot exceed ₹3000.');
    $('book').disabled=true;
    $('book').textContent='Confirming EEG Booking...';
    $('book').className='btn btn-success';
    $('bookMessage').hidden=false;
    $('bookMessage').textContent='Wait we are Confirming your EEG Booking...';
    const id=U.uuid('eeg'),p={eegBookingRequestId:id,appointmentId:sel.appointmentId,whatsapp:U.phone($('wa').value),city:$('city').value,eegCharges:total,eegPaymentMode:m,eegCashPaid:c,eegOnlinePaid:o};
    await IDB.put('tx',{id,type:'EEG_BOOKING',status:'pending',payload:p});
    try{
      const r=await NeuronAPI.call('bookEEG',p,25000);
      await IDB.put('tx',{id,type:'EEG_BOOKING',status:'complete',payload:p,result:r});
      $('confirmation').hidden=false;
      $('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Appointment Confirmed</h2><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(r.patientName||sel.name)}</b></div><div class="confirm-row"><span>EEG Charges</span><b>${U.money(r.eegCharges)}</b></div></div>`;
    }catch(e){
      try{
        const s=await NeuronAPI.call('checkEEGBookingRequest',{eegBookingRequestId:id,city:p.city},10000);
        if(s.found){
          await IDB.put('tx',{id,type:'EEG_BOOKING',status:'complete',payload:p,result:s});
          alert('Original EEG booking recovered: '+s.appointmentId);
          return;
        }
      }catch(_){}
      await IDB.put('tx',{id,type:'EEG_BOOKING',status:'uncertain',payload:p});
      alert('EEG booking status is uncertain. Do not book again.');
    }finally{
      $('book').disabled=false;
      $('book').textContent='Book EEG Appointment';
      $('book').className='cta';
      $('bookMessage').hidden=true;
      $('bookMessage').textContent='Wait we are Confirming your EEG Booking...';
    }
  };

  $('mode').onchange();
});
