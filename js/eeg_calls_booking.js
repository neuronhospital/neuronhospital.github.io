const EEG_CALLS_ACCESS_KEY="neuron_eeg_calls_access";
const EEG_CALLS_PASSWORD_HASH="7931486c46d8a4d07e683f1dfa62296fe5ffe494746c59b02a5540a1f1423390";

async function eegCallsSha256_(message){
  const data=new TextEncoder().encode(message);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

document.addEventListener("DOMContentLoaded",()=>{
  const $=id=>document.getElementById(id);
  const gate=$("gate"),password=$("password"),enter=$("enter"),bookingPortal=$("bookingPortal");
  const showBookingPortal=()=>{
    gate.hidden=true;
    bookingPortal.hidden=false;
    // Keep the viewport at the top of the booking portal without focusing any form field.
    window.scrollTo({top:0,left:0,behavior:"auto"});
    if(document.activeElement && typeof document.activeElement.blur==="function") document.activeElement.blur();
  };
  if(localStorage.getItem(EEG_CALLS_ACCESS_KEY)==="1") showBookingPortal();
  let verifyPending=false;
  password.addEventListener("input",()=>{
    password.value=password.value.replace(/\D/g,"").slice(0,6);
    if(password.value.length===6 && !verifyPending){ verifyPending=true; verify(); }
  });
  const verify=async()=>{
    enter.disabled=true;enter.textContent="Verifying…";
    try{
      if(!/^\d{6}$/.test(password.value)) throw Error("Enter the 6-digit password.");
      const h=await eegCallsSha256_(password.value);
      if(h!==EEG_CALLS_PASSWORD_HASH) throw Error("Incorrect password.");
      localStorage.setItem(EEG_CALLS_ACCESS_KEY,"1");
      const old=$("secureError"); if(old) old.remove();
      showBookingPortal();
    }catch(e){
      const old=$("secureError"); if(old) old.remove();
      const err=document.createElement("div"); err.id="secureError"; err.className="eeg-calls-secure-error"; err.textContent=e.message||"Unable to access portal."; gate.appendChild(err); password.focus();
    }finally{
      enter.disabled=false;enter.textContent="Access Portal";
      verifyPending=false;
    }
  };
  enter.onclick=verify;
  if(!bookingPortal.hidden) showBookingPortal();
  let bookingInProgress=false;

  const setStatus=(message,color="")=>{
    $("submitStatus").textContent=message||"";
    $("submitStatus").style.color=color;
  };

  const setFieldsDisabled=(disabled)=>{
    document.querySelectorAll("input,select").forEach(el=>el.disabled=disabled);
  };

  const checkWhatsApp=()=>{
    const a=U.phone($("whatsapp").value),b=U.phone($("verifyWhatsapp").value);
    const validA=U.validPhone(a),validB=U.validPhone(b);
    if(!b){
      $("verifyTick").style.display="none";
      $("waStatus").textContent="";
      return false;
    }
    if(validA&&validB&&a===b){
      $("verifyTick").style.display="inline";
      $("waStatus").textContent="✓ WhatsApp numbers match.";
      $("waStatus").style.color="#168a4a";
      return true;
    }
    $("verifyTick").style.display="none";
    $("waStatus").textContent=validB?"WhatsApp numbers do not match.":"Enter a valid 10-digit WhatsApp number.";
    $("waStatus").style.color="#b42318";
    return false;
  };

  ["whatsapp","verifyWhatsapp"].forEach(id=>{
    $(id).addEventListener("input",e=>{e.target.value=U.phone(e.target.value);checkWhatsApp();});
    $(id).addEventListener("copy",e=>e.preventDefault());
    $(id).addEventListener("cut",e=>e.preventDefault());
    $(id).addEventListener("paste",e=>e.preventDefault());
  });

  const resetForm=()=>{
    ["patientName","age","address","whatsapp","verifyWhatsapp","referredBy"].forEach(id=>$(id).value="");
    $("ageUnit").value="years";
    $("eegTechnician").value="Sanket Katke";
    $("paymentReceived").value="1000";
    $("verifyTick").style.display="none";
    $("waStatus").textContent="";
  };

  const applyRecoveryPrefill=()=>{
    let r=null;
    try{r=JSON.parse(localStorage.getItem("neuronRecoveryPrefillV1")||"null")}catch(_){r=null}
    if(!r||r.type!=="EEG_CALLS_BOOKING")return;
    const p=r.payload||{};
    const set=(id,v)=>{if($(id)&&v!==undefined&&v!==null)$(id).value=String(v)};
    set("patientName",p.patientName||p.childName); set("age",p.age); set("ageUnit",p.ageUnit||"years"); set("address",p.address);
    set("whatsapp",p.whatsapp); set("verifyWhatsapp",""); set("referredBy",p.referredBy);
    // Payment and transaction identity are intentionally reset to normal defaults.
    try{localStorage.removeItem("neuronRecoveryPrefillV1")}catch(_){}
    checkWhatsApp();
    setStatus("Patient details pre-filled from the failed recovery. Please review the details and submit a new EEG Calls booking.","#7b1fa2");
  };
  applyRecoveryPrefill();

  const showConfirmation=(r)=>{
    const html=`<div class="success"><div class="success-icon">✓</div><h2>EEG Appointment Confirmed</h2><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(r.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${U.esc(r.age)} ${U.esc(r.ageUnit)}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(r.address)}</b></div><div class="confirm-row"><span>WhatsApp</span><b>+91 ${U.esc(r.whatsapp)}</b></div><div class="confirm-row"><span>Referred By</span><b>${U.esc(r.referredBy)}</b></div><div class="confirm-row"><span>EEG Technician</span><b>${U.esc(r.eegTechnician)}</b></div><div class="confirm-row"><span>Payment Received</span><b>${U.money(r.paymentReceived)}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(r.date)}</b></div></div>`;
    $("confirmation").innerHTML=html;
    $("confirmation").hidden=false;
    requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
  };

  const showRecoveredConfirmation=(r,message)=>{
    showConfirmation(r);
    setStatus(message||"✓ Booking recovered successfully.","#168a4a");
  };

  const showBookingFailure=()=>{
    setStatus("Booking unsuccessful. You can Book Again.","#b42318");
    const modal=$("bookingFailureModal");
    if(modal){modal.hidden=false;requestAnimationFrame(()=>$('bookingFailureAgain')?.focus());}
  };

  const bookAgain=()=>{
    $("bookingFailureModal").hidden=true;
    setStatus("");
    $("confirmation").hidden=true;
    $("confirmation").innerHTML="";
    resetForm();
    bookingInProgress=false;
    setFieldsDisabled(false);
    $("book").disabled=false;
    $("book").textContent="Book EEG Appointment";
    $("book").className="cta";
  };
  $("bookingFailureAgain")?.addEventListener("click",bookAgain);

  window.addEventListener("neuron:recovery-result",e=>{
    const d=e.detail||{};
    if(d.globalHandled)return;
    if(d.type!=="EEG_CALLS_BOOKING")return;
    const currentName=U.title($("patientName")?.value||"");
    const currentPhone=U.phone($("whatsapp")?.value||"");
    const payload=d.payload||{};
    const samePatient=
      String(d.patientName||"").trim().replace(/\s+/g," ").toLowerCase()===String(currentName||"").trim().replace(/\s+/g," ").toLowerCase() &&
      (!currentPhone || U.phone(payload.whatsapp||"")===currentPhone);
    if(!samePatient)return;
    if(d.status==="recovered"){
      showRecoveredConfirmation(d.result||{},"✓ EEG Appointment recovered successfully.");
      resetForm();
      bookingInProgress=false;
      setFieldsDisabled(false);
      $("book").disabled=false;
      $("book").textContent="Book EEG Appointment";
      $("book").className="cta";
    }else if(d.status==="failed"){
      showBookingFailure();
      bookingInProgress=false;
      setFieldsDisabled(false);
      $("book").disabled=false;
      $("book").textContent="Book EEG Appointment";
      $("book").className="cta";
    }
  });

  $("book").onclick=async()=>{
    if(bookingInProgress)return;
    bookingInProgress=true;
    const required=[
      ["patientName","Please enter the patient's name."],
      ["age","Please enter the patient's age."],
      ["address","Please enter the patient's address."],
      ["whatsapp","Please enter the patient's WhatsApp number."],
      ["verifyWhatsapp","Please verify the WhatsApp number."],
      ["referredBy","Please enter Referred By Dr / Hospital."],
      ["eegTechnician","Please enter the EEG Technician."],
      ["paymentReceived","Please enter Payment Received."]
    ];
    for(const [id,msg] of required){
      if(!String($(id).value||"").trim()){
        setStatus(msg,"#b42318");$(id).focus();bookingInProgress=false;return;
      }
    }
    const age=Number($("age").value),payment=Number($("paymentReceived").value);
    if(!Number.isFinite(age)||age<=0){setStatus("Please enter a valid age.","#b42318");$("age").focus();bookingInProgress=false;return;}
    if(!checkWhatsApp()){setStatus("Please enter matching WhatsApp numbers.","#b42318");$("verifyWhatsapp").focus();bookingInProgress=false;return;}
    if(!Number.isFinite(payment)||payment<0){setStatus("Please enter a valid Payment Received amount.","#b42318");$("paymentReceived").focus();bookingInProgress=false;return;}

    const bookingPhone=U.phone($("whatsapp").value);
    const recoveryPatientName=U.title($("patientName").value);
    if(await window.NeuronRecovery?.isPatientRecovering?.({
      type:"EEG_CALLS_BOOKING",name:recoveryPatientName,whatsapp:bookingPhone
    })){
      setStatus(`${recoveryPatientName} has a pending EEG Calls appointment. The system is recovering the appointment status. Please wait for the recovery status to update before booking this patient again.`,"#7b1fa2");
      bookingInProgress=false;
      return;
    }

    const id=U.requestId8(),startedAt=Date.now(),timeoutMs=15000;
    const payload={
      bookingRequestId:id,
      patientName:U.title($("patientName").value),
      age:age,
      ageUnit:$("ageUnit").value,
      address:U.title($("address").value),
      whatsapp:bookingPhone,
      referredBy:U.title($("referredBy").value),
      eegTechnician:U.title($("eegTechnician").value),
      paymentReceived:payment
    };

    $("book").disabled=true;
    $("book").textContent="Confirming EEG Appointment...";
    $("book").className="btn btn-primary";
    setStatus("Wait We are Confirming your EEG Appointment...","#7b1fa2");
    setFieldsDisabled(true);

    try{
      try{await IDB.put("tx",{id,type:"EEG_CALLS_BOOKING",status:"pending",startedAt,timeoutMs,payload});}catch(_){}
      const r=await NeuronAPI.call("bookEEGCallsAppointment",payload,timeoutMs);
      try{await IDB.put("tx",{id,type:"EEG_CALLS_BOOKING",status:"complete",payload,result:r});}catch(_){ }
      try{await window.syncSuccessfulBookingToTodayCaches_?.({kind:"EEG_CALLS_BOOKING",rowNumber:r.rowNumber,appointmentId:r.appointmentId,date:r.date,time:r.time,patientName:r.patientName,age:r.age,ageUnit:r.ageUnit,address:r.address,whatsapp:r.whatsapp,referredBy:r.referredBy,paymentReceived:r.paymentReceived,eegTechnician:r.eegTechnician,bookingRequestId:id});}catch(_){ }
      showConfirmation(r);
      setStatus("✓ EEG Appointment submitted successfully.","#168a4a");
      resetForm();
      bookingInProgress=false;
      setFieldsDisabled(false);
      $("book").disabled=false;
      $("book").textContent="Book EEG Appointment";
      $("book").className="cta";
    }catch(e){
      // The outcome is unknown. Keep the same request ID in IndexedDB and let
      // shared recovery.js verify/reconcile it in the background.
      try{await IDB.put("tx",{id,type:"EEG_CALLS_BOOKING",status:"uncertain",payload});}catch(_){ }
      try{window.NeuronRecovery?.reconcilePendingBookings?.();}catch(_){ }
      setStatus("🔄 Checking EEG Appointment status…","#7b1fa2");
      bookingInProgress=false;
      setFieldsDisabled(false);
      $("book").disabled=false;
      $("book").textContent="Book EEG Appointment";
      $("book").className="cta";
    }finally{
      if($("confirmation").hidden && !bookingInProgress){
        $("book").disabled=false;
        $("book").textContent="Book EEG Appointment";
        $("book").className="cta";
      }
    }
  };

});
