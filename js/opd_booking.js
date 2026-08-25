document.addEventListener("DOMContentLoaded",()=>{
  const $=U.$, cities=NEURON_CONFIG.cities;
  let type="Follow-up", verified=false, selected=null;
  let nextFollowupCityManuallyEdited=false;
  let cityChangeToken=0;
  let bookingInProgress=false;
  let calendarYear=U.parts().y, calendarMonth=U.parts().m;

  // Show today's India-local date in the appointment field by default.
  // The field remains disabled until WhatsApp verification, and the calendar
  // remains collapsed until the user taps the date field.
  const setTodayDateDisplay=()=>{
    const p=U.parts();
    $("date").value=String(p.d).padStart(2,"0")+"-"+String(p.m).padStart(2,"0")+"-"+p.y;
  };

  // Recalculate the patient's approximate current age from the age recorded
  // at the original registration date. Follow-up age is rounded to the
  // nearest whole number and the most appropriate unit is selected.
  const currentFollowupAge=(age,ageUnit,registrationDate)=>{
    const n=Number(age);
    const raw=String(registrationDate||"").replace(/\D/g,"");
    if(!Number.isFinite(n)||n<0||raw.length!==8)return{value:n,unit:ageUnit||"years"};

    const rd=Number(raw.slice(0,2)), rm=Number(raw.slice(2,4)), ry=Number(raw.slice(4,8));
    const reg=new Date(Date.UTC(ry,rm-1,rd));
    if(!Number.isFinite(reg.getTime()))return{value:n,unit:ageUnit||"years"};

    // Reconstruct an approximate birth date from the recorded registration age.
    let birth=new Date(reg.getTime());
    const u=String(ageUnit||"years").toLowerCase();
    if(u.startsWith("day")) birth.setUTCDate(birth.getUTCDate()-Math.round(n));
    else if(u.startsWith("month")){
      const whole=Math.floor(n), frac=n-whole;
      birth.setUTCMonth(birth.getUTCMonth()-whole);
      if(frac)birth.setUTCDate(birth.getUTCDate()-Math.round(frac*30));
    }else{
      const whole=Math.floor(n), frac=n-whole;
      birth.setUTCFullYear(birth.getUTCFullYear()-whole);
      if(frac)birth.setUTCMonth(birth.getUTCMonth()-Math.round(frac*12));
    }

    const now=U.parts();
    const today=new Date(Date.UTC(now.y,now.m-1,now.d));
    let months=(today.getUTCFullYear()-birth.getUTCFullYear())*12+(today.getUTCMonth()-birth.getUTCMonth());
    if(today.getUTCDate()<birth.getUTCDate())months--;
    months=Math.max(0,months);

    if(months>=12)return{value:Math.max(1,Math.round((months/12)*2)/2),unit:"years"};
    if(months>=1)return{value:Math.max(1,Math.round(months)),unit:"months"};
    const days=Math.max(0,Math.round((today.getTime()-birth.getTime())/86400000));
    return{value:days,unit:"days"};
  };

  const getScheduledCityForToday=()=>Schedule.cityAtNow(cities);

  // Follow-up ordering uses the numeric timestamp calculated by the backend.
  // This avoids re-parsing Google Sheets Date/ISO/DD-MM-YYYY values in the
  // browser and guarantees that the same timestamp used for server-side
  // sorting is also used for display ordering.
  const followupDateScore=(value)=>{
    const s=String(value||"").replace(/\D/g,"");
    if(s.length!==8)return 0;
    return Number(s.slice(4)+s.slice(2,4)+s.slice(0,2));
  };

  const sortFollowupPatients=(patients)=>{
    patients.forEach((x,i)=>{x.__followupOriginalIndex=i;});
    patients.sort((a,b)=>{
      const at=Number.isFinite(Number(a.bookingTimestampMs))?Number(a.bookingTimestampMs):null;
      const bt=Number.isFinite(Number(b.bookingTimestampMs))?Number(b.bookingTimestampMs):null;

      // Primary rule: latest Booking Timestamp first, globally across cities.
      if(at!==null||bt!==null){
        if(at===null)return 1;
        if(bt===null)return -1;
        if(bt!==at)return bt-at;
      }

      // Legacy/invalid timestamp fallback: latest appointment date first.
      const ad=followupDateScore(a.date);
      const bd=followupDateScore(b.date);
      if(bd!==ad)return bd-ad;

      // Final deterministic tie-breaker: original backend order.
      return a.__followupOriginalIndex-b.__followupOriginalIndex;
    });
    patients.forEach(x=>{delete x.__followupOriginalIndex;});
    return patients;
  };

  const fillCities=()=>{
    $("city").innerHTML=cities.map(x=>`<option value="${x}">${x}</option>`).join("");
    $("next").innerHTML=cities.map(x=>`<option value="${x}">${x}</option>`).join("");
    const todayCity=getScheduledCityForToday();
    $("city").value=todayCity; $("next").value=todayCity;
  };

  const resetFields=(mode)=>{
    type=mode; verified=false; selected=null;
    nextFollowupCityManuallyEdited=false;
    cityChangeToken++;
    bookingInProgress=false;
    $("follow").classList.toggle("active",mode==="Follow-up");
    $("new").classList.toggle("active",mode==="New");
    $("followFields").hidden=mode!=="Follow-up";
    $("newFields").hidden=mode!=="New";
    // In Follow-up mode, show only patient retrieval until a patient is selected.
    $("bookingFields").hidden=mode==="Follow-up";
    // The Follow-up flow uses followWa only for retrieval; the New-patient
    // WhatsApp field must remain hidden until New mode is selected.
    $("newWhatsAppField").hidden=mode==="Follow-up";

    ["followWa","name","age","address","ref","wa"].forEach(id=>{$(id).value="";});
    $("date").value="";
    delete $("date").dataset.key;
    $("unit").value="years";
    const todayCity=getScheduledCityForToday();
    $("city").value=todayCity; $("next").value=todayCity;
    $("city").disabled=false; $("date").disabled=true; $("next").disabled=true; $("book").disabled=true;
    $("waStatus").textContent=""; $("waStatus").style.color="";
    $("followStatus").textContent=""; $("patients").innerHTML="";
    $("selectedPatientCard").hidden=true;
    $("selectedPatientName").textContent="—";
    $("selectedPatientAge").textContent="—";
    $("selectedPatientCity").textContent="—";
    $("selectedPatientBookingDate").textContent="—";
    $("submitStatus").textContent="";
    $("confirmation").hidden=true; $("confirmation").innerHTML="";
    $("cal").hidden=true; $("cal").innerHTML="";
    $("payMode").value="Cash"; $("amount").value="500"; $("cash").value=""; $("online").value="";
    updatePaymentUI();
    calendarYear=U.parts().y; calendarMonth=U.parts().m;
  };

  const enableAfterWhatsApp=()=>{
    verified=true;
    $("city").disabled=false; $("date").disabled=false; $("next").disabled=false; $("book").disabled=false;
  };

  /*
   * IMPORTANT: Do not rewrite the input value on every keystroke.
   * Replacing el.value during input can interfere with Android/mobile
   * backspace behavior, especially when several words are present.
   *
   * While typing, the field is left untouched so spaces and Backspace
   * behave exactly like a normal input. Capitalization is applied when
   * the user leaves the field and again immediately before submission.
   */
  const titleTyping=(el)=>{
    el.value=U.titleTyping(el.value);
  };
  ["name","address","ref"].forEach(id=>{
    $(id).addEventListener("blur",e=>titleTyping(e.target));
  });

  const updatePaymentUI=()=>{
    const mode=$("payMode").value;
    const split=mode==="Split";
    $("opdChargesLabel").textContent=mode==="Cash"
      ? "OPD Charges Paid in Cash"
      : mode==="Online"
        ? "OPD Charges Paid Online"
        : "OPD Charges Paid in Split";
    $("singleChargeField").hidden=split;
    $("splitField").hidden=!split;
    if(split){
      $("amount").value="";
      updateSplitTotal();
    }else{
      $("cash").value=""; $("online").value="";
      if(!$("amount").value)$("amount").value="500";
    }
  };
  const updateSplitTotal=()=>{
    const c=Math.max(0,Number($("cash").value)||0),o=Math.max(0,Number($("online").value)||0);
    $("splitTotal").textContent="Total: "+U.money(c+o);
    $("splitTotal").style.color=(c+o>2000)?"#b42318":"";
  };
  $("payMode").onchange=updatePaymentUI;
  $("cash").oninput=updateSplitTotal; $("online").oninput=updateSplitTotal;

  $("follow").onclick=async()=>{resetFields("Follow-up"); await setNextAvailableDate($("city").value); $("cal").hidden=true;};
  $("new").onclick=async()=>{resetFields("New"); await setNextAvailableDate($("city").value); $("cal").hidden=true;};

  $("wa").oninput=e=>e.target.value=U.phone(e.target.value);
  $("followWa").oninput=e=>e.target.value=U.phone(e.target.value);

  $("waBtn").onclick=()=>{
    const p=U.phone($("wa").value);
    if(!U.validPhone(p)){ $("waStatus").textContent="Enter a valid 10-digit number."; return; }
    window.open("https://wa.me/91"+p,"_blank");
    $("waStatus").textContent="✓ WhatsApp number confirmed";
    $("waStatus").style.color="#168a4a";
    enableAfterWhatsApp();
  };

  async function getCalendarDates(year,month,city){
    try{
      const local=Schedule.dates(city,year,month);
      if(local&&local.length)return local;
    }catch(_){}
    try{
      const r=await NeuronAPI.call("getAvailableDates",{city,year,month},12000);
      return r.dates||[];
    }catch(_){return [];}
  }

  async function renderCalendar(){
    const city=$("city").value;
    const today=U.parts();
    const dates=await getCalendarDates(calendarYear,calendarMonth,city);
    const first=new Date(Date.UTC(calendarYear,calendarMonth-1,1)).getUTCDay()||7;
    const last=new Date(Date.UTC(calendarYear,calendarMonth,0)).getUTCDate();
    const monthName=new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(Date.UTC(calendarYear,calendarMonth-1,1)));
    const isCurrentMonth=(calendarYear===today.y && calendarMonth===today.m);
    let h=`<div class="calendar-head"><button type="button" id="calPrev" class="calendar-nav" aria-label="Previous month" ${isCurrentMonth?"disabled":""}>‹</button><strong id="calMonthTitle" class="calendar-month-title">${monthName}</strong><button type="button" id="calNext" class="calendar-nav" aria-label="Next month">›</button></div>`;
    h+=`<div class="calendar-grid">`;
    ["M","T","W","T","F","S","S"].forEach(x=>h+=`<div class="calendar-weekday">${x}</div>`);
    for(let i=1;i<first;i++)h+="<span></span>";
    for(let d=1;d<=last;d++){
      const key=String(d).padStart(2,"0")+String(calendarMonth).padStart(2,"0")+calendarYear;
      const isPast=calendarYear<today.y || (calendarYear===today.y&&calendarMonth<today.m) || (calendarYear===today.y&&calendarMonth===today.m&&d<today.d);
      const isToday=calendarYear===today.y&&calendarMonth===today.m&&d===today.d;
      const isAvailable=dates.includes(key)&&!isPast;
      const isSelected=$("date").dataset.key===key;
      let cls=isSelected?"selected":isAvailable?"available":"unavailable";
      h+=`<button type="button" class="${cls}" ${isAvailable?`data-k="${key}"`:"disabled"}>${d}${isToday?'<small class="today-mark">Today</small>':""}</button>`;
    }
    h+=`</div><div class="legend">🟣 Available &nbsp; ⚫ Not Available &nbsp; 🟢 Selected</div>`;
    $("cal").innerHTML=h; $("cal").hidden=false;
    $("calPrev").onclick=async()=>{if(calendarYear===today.y&&calendarMonth===today.m)return; calendarMonth--;if(calendarMonth<1){calendarMonth=12;calendarYear--;} if(calendarYear<today.y || (calendarYear===today.y&&calendarMonth<today.m)){calendarYear=today.y;calendarMonth=today.m;} await renderCalendar();};
    $("calNext").onclick=async()=>{calendarMonth++;if(calendarMonth>12){calendarMonth=1;calendarYear++;}await renderCalendar();};
    $("calMonthTitle").onclick=async()=>{calendarYear=today.y;calendarMonth=today.m;await renderCalendar();};
    $("cal").querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{
      $("date").value=U.date(b.dataset.k); $("date").dataset.key=b.dataset.k; $("cal").hidden=true;
    });
  }

  async function setFollowupDefaultDate(city){
    const today=U.parts();
    let y=today.y, m=today.m;
    // Search forward only for the first scheduled date that is today or later.
    // The calendar itself remains collapsed; this helper only sets the field.
    for(let step=0;step<13;step++){
      const dates=await getCalendarDates(y,m,city);
      const valid=(dates||[]).filter(k=>{
        const q=String(k).replace(/\\D/g,"");
        if(q.length!==8)return false;
        const d=Number(q.slice(0,2)), mm=Number(q.slice(2,4)), yy=Number(q.slice(4,8));
        return yy>today.y || (yy===today.y && (mm>today.m || (mm===today.m && d>=today.d)));
      }).sort();
      if(valid.length){
        $("date").value=U.date(valid[0]);
        $("date").dataset.key=valid[0];
        calendarYear=y; calendarMonth=m;
        $("cal").hidden=true;
        return;
      }
      m++;
      if(m>12){m=1;y++;}
    }
    $("date").value="";
    delete $("date").dataset.key;
    $("cal").hidden=true;
  }

  async function setNextAvailableDate(city){
    const today=U.parts();
    let y=today.y, m=today.m;
    for(let step=0;step<13;step++){
      const dates=await getCalendarDates(y,m,city);
      const valid=(dates||[]).map(k=>String(k).replace(/\\D/g,"")).filter(k=>{
        if(k.length!==8)return false;
        const d=Number(k.slice(0,2)), mm=Number(k.slice(2,4)), yy=Number(k.slice(4,8));
        return yy>today.y || (yy===today.y && (mm>today.m || (mm===today.m && d>=today.d)));
      }).sort();
      if(valid.length){
        $("date").value=U.date(valid[0]);
        $("date").dataset.key=valid[0];
        calendarYear=y; calendarMonth=m;
        return;
      }
      m++;
      if(m>12){m=1;y++;}
    }
    $("date").value="";
    delete $("date").dataset.key;
  }

  const setDateLoading=(loading,city)=>{
    $("dateLoading").hidden=!loading;
    $("dateLoading").textContent=loading
      ? "Wait we are Loading Available date for "+city+" Visit"
      : "";
    // Keep Visit Location editable while available dates are loading.
    // Disabling a mobile <select> inside its change event can visually restore
    // the previous option on some browsers.
    $("city").disabled=false;
    $("date").disabled=loading || !verified;
    $("next").disabled=loading || !verified;
    $("book").disabled=loading || !verified;
  };

  $("next").onchange=()=>{
    nextFollowupCityManuallyEdited=true;
  };

  $("city").onchange=async()=>{
    const city=$("city").value;
    const token=++cityChangeToken;

    // New OPD: Next Follow-up City initially follows Visit Location.
    // Once the user edits Next Follow-up City, keep it independent.
    if(type==="New" && !nextFollowupCityManuallyEdited) $("next").value=city;

    delete $("date").dataset.key;
    $("date").value="";
    $("cal").hidden=true;
    const now=U.parts();calendarYear=now.y;calendarMonth=now.m;

    if(!verified){
      setTodayDateDisplay();
      return;
    }

    setDateLoading(true,city);
    try{
      await setNextAvailableDate(city);
    }finally{
      // Ignore completion of an older city lookup. A previous request must
      // never overwrite the state belonging to the latest selected city.
      if(token===cityChangeToken){
        setDateLoading(false,city);
      }
    }
  };
  const openDateCalendar=()=>{
    const t=U.parts();
    if(calendarYear<t.y || (calendarYear===t.y && calendarMonth<t.m)){calendarYear=t.y;calendarMonth=t.m;}
    renderCalendar();
  };
  $("date").onclick=openDateCalendar;
  $("dateIcon").onclick=openDateCalendar;

  $("load").onclick=async()=>{
    // Starting a new patient retrieval must clear every previous booking stage.
    selected=null; verified=false;
    $("patients").innerHTML="";
    // A new Load operation starts a fresh patient-selection cycle.
    // Hide and clear the previously selected-patient summary immediately.
    $("selectedPatientCard").hidden=true;
    $("selectedPatientName").textContent="—";
    $("selectedPatientAge").textContent="—";
    $("selectedPatientCity").textContent="—";
    $("selectedPatientBookingDate").textContent="—";
    $("bookingFields").hidden=true;
    $("bookingFields").setAttribute("hidden","");
    $("confirmation").hidden=true;
    $("confirmation").innerHTML="";
    $("submitStatus").textContent="";
    $("followStatus").textContent="";
    $("followStatus").style.color="";
    $("city").disabled=true; $("date").disabled=true; $("next").disabled=true; $("book").disabled=true;
    const p=U.phone($("followWa").value);
    if(!U.validPhone(p)){
      $("followStatus").textContent="Enter a valid 10-digit WhatsApp number.";
      $("followStatus").style.color="#b42318";
      $("load").disabled=false;
      $("load").textContent="Load";
      $("load").className="btn btn-secondary";
      return;
    }
    $("load").disabled=true;
    $("load").textContent="Loading...";
    $("load").className="btn btn-primary";
    $("followStatus").textContent="Wait We are Loading Patient details...";
    $("followStatus").style.color="#7b1fa2";
    try{
      const r=await NeuronAPI.call("getPatientHistoryByWhatsApp",{whatsapp:p});
      const groups=Array.isArray(r.groups)?r.groups:[];
      const patients=Array.isArray(r.patients)?r.patients.slice():[];
      $("patients").innerHTML="";

      // Display one clearly separated section per city. Scheduled city/cities
      // are returned first by the backend; records within each city are newest first.
      const renderPatient=(x)=>{
        const b=document.createElement("button"); b.type="button"; b.className="patient-option";
        b.innerHTML=`<b>${U.esc(x.name)}</b><small>${U.esc(x.age)} ${U.esc(x.ageUnit)} • ${U.esc(x.city)} • ${U.date(x.date)}</small>`;
        b.onclick=()=>{
          // Selecting another patient must remove any confirmation belonging to a previous patient.
          $("confirmation").hidden=true;
          $("confirmation").innerHTML="";
          $("submitStatus").textContent="";
          selected=x; document.querySelectorAll(".patient-option").forEach(z=>z.classList.remove("selected")); b.classList.add("selected");
          $("selectedPatientName").textContent=U.title(x.name||"—");
          $("selectedPatientAge").textContent=`${x.age ?? "—"} ${x.ageUnit||""}`.trim();
          $("selectedPatientCity").textContent=x.city||"—";
          $("selectedPatientBookingDate").textContent=U.date(x.date)||"—";
          $("selectedPatientCard").hidden=false;
          $("name").value=U.title(x.name);
          const followupAge=currentFollowupAge(x.age,x.ageUnit,x.date);
          $("age").value=followupAge.value;
          $("unit").value=followupAge.unit;
          $("address").value=U.title(x.address||""); $("ref").value=U.title(x.referredBy||"");
          // Follow-up Visit Location is schedule-aware by default, regardless
          // of the city used in the previous booking. It remains editable.
          const scheduleAwareCity=getScheduledCityForToday();
          $("city").value=scheduleAwareCity;
          // Next Follow-up City carries forward the city from the previous
          // booking, and remains independently editable.
          $("next").value=x.nextFollowupCity||x.city||scheduleAwareCity;
          // Explicitly reveal the complete Follow-up editing/booking stage.
          $("bookingFields").hidden=false;
          $("bookingFields").removeAttribute("hidden");
          $("newFields").hidden=false;
          $("newFields").removeAttribute("hidden");
          enableAfterWhatsApp();
          const now=U.parts();calendarYear=now.y;calendarMonth=now.m;
          setFollowupDefaultDate($("city").value);
          requestAnimationFrame(()=>{
            $("bookingFields").scrollIntoView({behavior:"smooth",block:"start"});
          });
        };
        return b;
      };

      if(groups.length){
        groups.forEach((group)=>{
          const section=document.createElement("div");
          section.className="followup-city-section";

          const heading=document.createElement("div");
          heading.className="followup-city-heading";
          heading.textContent=group.city+(group.scheduledToday?" — Today":"");
          section.appendChild(heading);

          group.patients.forEach((x)=>{
            section.appendChild(renderPatient(x));
          });
          $("patients").appendChild(section);
        });
      }else{
        patients.forEach((x)=>$("patients").appendChild(renderPatient(x)));
      }

      if(patients.length===1) $("patients").querySelector(".patient-option").click();

      if(!patients.length){
        $("followStatus").textContent="No patient found for this WhatsApp number.";
        $("followStatus").style.color="#b42318";
      }else{
        $("followStatus").textContent=`${patients.length} patient(s) found.`;
        $("followStatus").style.color="#168a4a";
      }
    }catch(e){
      $("followStatus").textContent="Unable to retrieve patient details: "+(e.message||"Network/server error.");
      $("followStatus").style.color="#b42318";
    }
    finally{
      $("load").disabled=false;
      $("load").textContent="Load";
      $("load").className="btn btn-secondary";
    }
  };

  $("book").onclick=async()=>{
    if($("book").disabled || bookingInProgress)return;
    bookingInProgress=true;
    $("book").disabled=true;
    $("book").textContent="Confirming Appointment...";
    $("book").className="btn btn-primary";
    $("submitStatus").textContent="Wait We are Confirming your OPD Appointment...";
    $("submitStatus").style.color="#7b1fa2";

    const payMode=$("payMode").value;
    let c=0,o=0,total=0;
    if(payMode==="Cash"){total=Number($("amount").value)||0;c=total;}
    else if(payMode==="Online"){total=Number($("amount").value)||0;o=total;}
    else{c=Number($("cash").value)||0;o=Number($("online").value)||0;total=c+o;}

    if(total>2000){$("submitStatus").textContent="OPD total cannot exceed ₹2000.";$("submitStatus").style.color="#b42318";$("book").disabled=false;$("book").textContent="Book OPD Appointment";$("book").className="cta";return;}
    if(total<0){$("submitStatus").textContent="Enter a valid OPD amount.";$("submitStatus").style.color="#b42318";$("book").disabled=false;$("book").textContent="Book OPD Appointment";$("book").className="cta";return;}
    if(!String($("address").value||"").trim()){
      $("submitStatus").textContent="Please enter the patient's address.";
      $("submitStatus").style.color="#b42318";
      $("address").focus();
      $("book").disabled=false;
      $("book").textContent="Book OPD Appointment";
      $("book").className="cta";
      return;
    }

    const id=U.uuid("opd");
    const payload={
      bookingRequestId:id,
      childName:U.title($("name").value),
      age:Number($("age").value),
      ageUnit:$("unit").value,
      address:U.title($("address").value),
      referredBy:U.title($("ref").value),
      // Follow-up uses the verified retrieval number; New uses its own WhatsApp field.
      whatsapp:U.phone(type==="Follow-up"?$("followWa").value:$("wa").value),
      city:$("city").value,
      appointmentDate:$("date").dataset.key,
      nextFollowupCity:$("next").value,
      patientType:type,
      opdCharges:total,
      opdPaymentMode:payMode,
      opdCashPaid:c,
      opdOnlinePaid:o
    };

    if(!payload.appointmentDate){
      $("submitStatus").textContent="Please select an available appointment date.";
      $("submitStatus").style.color="#b42318";
      $("book").disabled=false;
      $("book").textContent="Book OPD Appointment";
      $("book").className="cta";
      return;
    }

    try{
      // Local recovery journaling is best-effort only. It must NEVER block
      // the actual online booking request or leave the UI stuck on Confirming.
      try{await Promise.race([
        IDB.put("tx",{id,type:"OPD_BOOKING",status:"pending",payload}),
        new Promise(resolve=>setTimeout(resolve,1500))
      ]);}catch(_){ }

      const r=await NeuronAPI.call("bookAppointment",payload,25000);
      try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"complete",payload,result:r});}catch(_){ }
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
      const confirmationHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Confirmed</h2><p class="city-confirm">For <b>${U.esc(payload.city||"")}</b> City</p><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(r.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${r.age} ${r.ageUnit}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(r.address||payload.address)}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(r.date)}</b></div><div class="confirm-row"><span>OPD Charges</span><b>${U.money(r.opdCharges)}</b></div><div class="confirm-row"><span>Cash</span><b>${U.money(r.opdCashPaid)}</b></div><div class="confirm-row"><span>Online</span><b>${U.money(r.opdOnlinePaid)}</b></div><div class="confirm-row"><span>Next Follow-up City</span><b>${U.esc(r.nextFollowupCity||payload.nextFollowupCity)}</b></div></div>`;
      resetFields("Follow-up");
      // resetFields intentionally clears the booking form, so restore the
      // confirmation content AFTER the reset.
      $("confirmation").innerHTML=confirmationHTML;
      $("confirmation").hidden=false;
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
    }catch(e){
      try{
        const s=await NeuronAPI.call("checkBookingRequest",{bookingRequestId:id,city:payload.city},10000);
        if(s.found){
          try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"complete",payload,result:s});}catch(_){ }
          const recoveredHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Recovered</h2><p>Appointment ID: <b>${U.esc(s.appointmentId)}</b></p><p>Original booking was already recorded. No duplicate was created.</p></div>`;
          resetFields("Follow-up");
          $("confirmation").innerHTML=recoveredHTML;
          $("confirmation").hidden=false;
          return;
        }
      }catch(_){}
      try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"uncertain",payload});}catch(_){ }
      $("submitStatus").textContent="Booking status is uncertain. Do not submit another booking. Reopen with internet to recover the original request.";
      $("submitStatus").style.color="#b42318";
      alert("Booking status is uncertain. Do not book again.");
    }finally{
      if($("confirmation").hidden){
        bookingInProgress=false;
        $("book").disabled=false;
        $("book").textContent="Book OPD Appointment";
        $("book").className="cta";
      }
    }
  };

  fillCities();
  resetFields("Follow-up");
  setNextAvailableDate($("city").value);

  // Mobile browsers may restore a page from the back-forward cache with
  // stale button text. If no booking is actually running, normalize it.
  window.addEventListener("pageshow",()=>{
    if(!bookingInProgress){
      $("book").disabled=!verified;
      $("book").textContent="Book OPD Appointment";
      $("book").className=verified?"cta":"cta";
    }
  });
});
