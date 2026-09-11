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

      // Clear previous split values when switching to Cash/Online
      $('cash').value='';
      $('online').value='';
      $('total').textContent='₹0';

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

  $('wa').addEventListener('input',()=>{
    const wa=$('wa').value.trim();
    const msg=document.getElementById('waError');
    if(msg && /^[6789]\d{9}$/.test(wa)){
      msg.textContent='';
    }
  });

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
      const r=await NeuronAPI.call('getEEGBookingPatients',{whatsapp:U.phone($('wa').value),city:$('city').value});
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
    const id=U.uuid('eeg'),p={eegBookingRequestId:id,appointmentId:sel.appointmentId,rowNumber:sel.rowNumber,whatsapp:U.phone($('wa').value),city:$('city').value,eegCharges:total,eegPaymentMode:m,eegCashPaid:c,eegOnlinePaid:o};
    try{
      const r=await NeuronAPI.call('bookEEG',p,25000);
      const confirmationPatient=r.patientName||sel.name;
      $('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Appointment Confirmed</h2><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(confirmationPatient)}</b></div><div class="confirm-row"><span>EEG Charges</span><b>${U.money(r.eegCharges)}</b></div></div>`;
      $('patients').innerHTML='';
      sel=null;
      $('payment').hidden=true;
      $('paymentPatientName').textContent='';
      $('amount').value='';
      $('cash').value='';
      $('online').value='';
      $('total').textContent='₹0';
      $('status').textContent='';
      $('confirmation').hidden=false;
    }catch(e){
      $('confirmation').innerHTML=`<div class="card"><h2>EEG Booking Uncertain</h2><p>We couldn't confirm the EEG booking.</p><p>The booking request may have been recorded safely.</p><p><b>Please do not create another booking yet.</b></p><button id="checkEEGStatus" type="button" class="cta" style="width:100%;margin-top:10px">Check Status</button><div id="eegStatusMessage" class="status" style="margin-top:10px"></div></div>`;
      $('confirmation').hidden=false;
      const check=$('checkEEGStatus');
      check.onclick=async()=>{
        if(check.disabled)return;
        check.disabled=true;
        check.textContent='Checking...';
        const msg=$('eegStatusMessage');
        if(msg)msg.textContent='Checking EEG booking...';
        try{
          const r=await NeuronAPI.call('checkEEGBookingRequest',{eegBookingRequestId:id,appointmentId:p.appointmentId,rowNumber:p.rowNumber,city:p.city},10000);
          if(r&&r.found){
            const confirmationPatient=r.patientName||sel?.name||'';
            $('confirmation').innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>EEG Appointment Confirmed</h2><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(confirmationPatient)}</b></div><div class="confirm-row"><span>EEG Charges</span><b>${U.money(r.eegCharges)}</b></div><div class="status" style="margin-top:10px">✓ Booking recovered</div></div>`;
            $('patients').innerHTML='';
            sel=null;
            $('payment').hidden=true;
            $('paymentPatientName').textContent='';
            $('amount').value='';
            $('cash').value='';
            $('online').value='';
            $('total').textContent='₹0';
            $('status').textContent='';
          }else{
            $('confirmation').innerHTML=`<div class="card"><h2>EEG Booking Unsuccessful</h2><p>No matching EEG booking was found for this patient.</p><p><b>You can book the EEG again.</b></p></div>`;
            $('book').disabled=false;
            $('book').textContent='Book EEG Appointment';
            $('book').className='cta';
          }
        }catch(checkError){
          check.disabled=false;
          check.textContent='Check Status';
          if(msg)msg.textContent=checkError.message||'Could not check EEG booking status. Please try again.';
        }
      };
    }finally{
      // Keep booking disabled while the result is uncertain; it is re-enabled only
      // after Check Status confirms that the EEG booking was not recorded.
      if(!$('checkEEGStatus')){
        $('book').disabled=false;
        $('book').textContent='Book EEG Appointment';
        $('book').className='cta';
      }
      $('bookMessage').hidden=true;
      $('bookMessage').textContent='Wait we are Confirming your EEG Booking...';
    }
  };

  $('mode').onchange();
});
