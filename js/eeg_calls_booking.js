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

  const showConfirmation=(r)=>{
    const html=`<div class="success"><div class="success-icon">✓</div><h2>EEG Appointment Confirmed</h2><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(r.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${U.esc(r.age)} ${U.esc(r.ageUnit)}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(r.address)}</b></div><div class="confirm-row"><span>WhatsApp</span><b>+91 ${U.esc(r.whatsapp)}</b></div><div class="confirm-row"><span>Referred By</span><b>${U.esc(r.referredBy)}</b></div><div class="confirm-row"><span>EEG Technician</span><b>${U.esc(r.eegTechnician)}</b></div><div class="confirm-row"><span>Payment Received</span><b>${U.money(r.paymentReceived)}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(r.date)}</b></div></div>`;
    $("confirmation").innerHTML=html;
    $("confirmation").hidden=false;
    requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
  };

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
        setStatus(msg,"#b42318");
        $(id).focus();
        bookingInProgress=false;
        return;
      }
    }
    const age=Number($("age").value),payment=Number($("paymentReceived").value);
    if(!Number.isFinite(age)||age<=0){setStatus("Please enter a valid age.","#b42318");$("age").focus();bookingInProgress=false;return;}
    if(!checkWhatsApp()){setStatus("Please enter matching WhatsApp numbers.","#b42318");$("verifyWhatsapp").focus();bookingInProgress=false;return;}
    if(!Number.isFinite(payment)||payment<0){setStatus("Please enter a valid Payment Received amount.","#b42318");$("paymentReceived").focus();bookingInProgress=false;return;}

    const requestId=U.uuid("eegcalls");
    const payload={
      bookingRequestId:requestId,
      patientName:U.title($("patientName").value),
      age:age,
      ageUnit:$("ageUnit").value,
      address:U.title($("address").value),
      whatsapp:U.phone($("whatsapp").value),
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
      const r=await NeuronAPI.call("bookEEGCallsAppointment",payload,25000);
      showConfirmation(r);
      setStatus("✓ EEG Appointment submitted successfully.","#168a4a");
      resetForm();
    }catch(e){
      setStatus("Unable to book EEG Appointment: "+(e.message||"Unexpected error."),"#b42318");
      const err=document.createElement("div");
      err.className="booking-error";
      err.textContent="EEG Appointment could not be booked. Please correct any issue shown above and try again.";
      $("submitStatus").after(err);
      setTimeout(()=>err.remove(),7000);
    }finally{
      bookingInProgress=false;
      setFieldsDisabled(false);
      $("book").disabled=false;
      $("book").textContent="Book EEG Appointment";
      $("book").className="cta";
    }
  };
});
