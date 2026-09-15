document.addEventListener("DOMContentLoaded",()=>{
  const $=U.$, cities=Schedule.cities;
  let type="New", verified=false, selected=null;
  let nextFollowupCityManuallyEdited=false;
  let cityChangeToken=0;
  let bookingInProgress=false;
  let bookingSessionId=0;
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

  const initFollowupCity=()=>{
    const el=$("followCity");
    if(!el)return;
    el.innerHTML=cities.map(c=>`<option value="${U.esc(c)}">${U.esc(c)}</option>`).join("");
    const scheduled=getScheduledCityForToday();
    if(scheduled)el.value=scheduled;
  };

  const isTodayFollowupRecord=(x)=>{
    const raw=String(x.date||x.bookingDate||x.visitDate||"").replace(/\D/g,"");
    const p=U.parts();
    const today=String(p.d).padStart(2,"0")+String(p.m).padStart(2,"0")+p.y;
    return raw===today;
  };

  // Backend returns follow-up patients in authoritative display order.
  // Only remove same-day records here; do not re-sort them in the browser.
  const cleanFollowupPatients=(patients)=>{
    return (patients||[]).filter(x=>!isTodayFollowupRecord(x)).slice(0,10);
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

    ["followWa","name","age","address","ref","wa","verifyWa"].forEach(id=>{$(id).value="";});
    $("date").value="";
    delete $("date").dataset.key;
    $("unit").value="years";
    const todayCity=getScheduledCityForToday();
    $("city").value=todayCity; $("next").value=todayCity;
    // Follow-up locking is scoped to Follow-up mode only. When switching
    // back to New, explicitly clear every Follow-up lock before applying the
    // normal v175 pre-verification state. This prevents readOnly/disabled
    // styling from leaking into New OPD after a patient was retrieved.
    if(mode==="New") setFollowupFieldsLocked(false);
    setPostVerifyFieldsLocked(true);
    if($("editFollowup")) $("editFollowup").hidden=true;
    if($("book")){ $("book").textContent="Book Appointment"; $("book").className="cta"; }
    const editActions=$("editFollowup")?.closest(".followup-edit-actions");
    if(editActions) editActions.classList.remove("editing");
    $("waStatus").textContent=""; $("waStatus").style.color="";
    $("verifyTick").style.display="none";
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

  const setPostVerifyFieldsLocked=(locked)=>{
    ["payMode","amount","cash","online","city","date","next"].forEach(id=>{
      if($(id)) $(id).disabled=locked;
    });
    if($("book")) $("book").disabled=locked;
  };

  const showFollowupLockPopup=(field)=>{
    const popup=$("followupLockPopup");
    if(!popup)return;
    popup.textContent="Click Edit to enable this field.";
    popup.classList.add("show");
    const rect=field?.getBoundingClientRect?.();
    if(!rect){
      popup.style.left="50%";
      popup.style.top="50%";
      popup.style.transform="translate(-50%,-50%)";
    }else{
      popup.style.transform="none";
      const gap=6, margin=12;
      const popupRect=popup.getBoundingClientRect();
      let left=Math.min(Math.max(margin,rect.left),Math.max(margin,window.innerWidth-popupRect.width-margin));
      let top=rect.bottom+gap;
      if(top+popupRect.height>window.innerHeight-margin) top=Math.max(margin,rect.top-popupRect.height-gap);
      popup.style.left=`${left}px`;
      popup.style.top=`${top}px`;
    }
    clearTimeout(showFollowupLockPopup.timer);
    showFollowupLockPopup.timer=setTimeout(()=>{
      popup.classList.remove("show");
      popup.style.transform="none";
    },2200);
  };

  const setFollowupFieldsLocked=(locked)=>{
    const ids=["name","age","unit","address","ref","city","date","next"];
    ids.forEach(id=>{
      const el=$(id);
      if(!el)return;
      const field=el.closest(".field");
      el.dataset.followupLocked=locked?"true":"false";
      if(field) field.dataset.followupLocked=locked?"true":"false";
      if(el.tagName==="SELECT" || el.id==="date") el.disabled=locked;
      else el.readOnly=locked;
      el.classList.toggle("followup-field-locked",locked);
      // Disabled controls do not reliably emit click/pointer events on mobile.
      // Let the field container receive the event so the lock message can appear.
      el.style.pointerEvents=locked?"none":"";
    });
    if($("editFollowup")) $("editFollowup").hidden=!locked;
  };

  $("editFollowup").onclick=()=>{
    if(type!=="Follow-up" || !selected)return;
    setFollowupFieldsLocked(false);
    enableAfterWhatsApp();
    $("editFollowup").hidden=true;
    const actions=$("editFollowup").closest(".followup-edit-actions");
    if(actions) actions.classList.add("editing");
    $("book").textContent="Book OPD Appointment";
  };

  const handleLockedFollowupFieldInteraction=(e)=>{
    if(type!=="Follow-up" || !selected)return;
    if($("editFollowup") && $("editFollowup").hidden)return;
    const field=e.target?.closest?.(".field[data-followup-locked='true']");
    if(!field)return;
    e.preventDefault();
    e.stopPropagation();
    showFollowupLockPopup(field);
  };
  // Show the lock popup only after an actual click/tap. Do not handle pointerdown,
  // because touch-scrolling can begin with a pointerdown inside a locked field.
  $("bookingFields").addEventListener("click",handleLockedFollowupFieldInteraction,true);

  const enableAfterWhatsApp=()=>{
    verified=true;
    setPostVerifyFieldsLocked(false);
  };

  const checkWhatsAppMatch=()=>{
    const a=U.phone($("wa").value), b=U.phone($("verifyWa").value);
    if(a && b && a===b && U.validPhone(a)){
      $("waStatus").textContent="";
      $("waStatus").style.color="#168a4a";
      $("verifyTick").style.display="inline";
      $("verifyWa").style.borderColor="#168a4a";
      enableAfterWhatsApp();
    }else{
      $("waStatus").textContent="";
      $("verifyTick").style.display="none";
      $("verifyWa").style.borderColor="";
      verified=false;
      setPostVerifyFieldsLocked(true);
    }
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
  $("new").onclick=async()=>{
    resetFields("New");
    unlockBeforeWhatsApp();
    await setNextAvailableDate($("city").value);
    $("cal").hidden=true;
  };

  $("wa").oninput=e=>{e.target.value=U.phone(e.target.value);checkWhatsAppMatch();};
  $("verifyWa").oninput=e=>{e.target.value=U.phone(e.target.value);checkWhatsAppMatch();};
  ["wa","verifyWa"].forEach(id=>{
    $(id).addEventListener("copy",e=>e.preventDefault());
    $(id).addEventListener("cut",e=>e.preventDefault());
    $(id).addEventListener("paste",e=>e.preventDefault());
  });
  $("followWa").oninput=e=>e.target.value=U.phone(e.target.value);

  function getCalendarDates(year,month,city){
    try{
      return Schedule.dates(city,year,month)||[];
    }catch(_){
      return [];
    }
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
  cacheCityFollowup();
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
    // Freeze the retrieval city while the Load request is in progress so the
    // user cannot accidentally change the search city mid-request. It becomes
    // selectable again only after the Load operation finishes.
    $("followCity").disabled=true;
    $("city").disabled=true; $("date").disabled=true; $("next").disabled=true; $("book").disabled=true;
    const p=U.phone($("followWa").value);
    if(!U.validPhone(p)){
      $("followStatus").textContent="Enter a valid 10-digit WhatsApp number.";
      $("followStatus").style.color="#b42318";
      $("followCity").disabled=false;
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
      const followCity=$("followCity")?$("followCity").value:"";
const r = await NeuronAPI.call("getPatientHistoryByWhatsApp", {
  whatsapp: p,
  city: followCity
}, 25000);

      let patients=Array.isArray(r.patients)?r.patients.slice():[];
      patients=cleanFollowupPatients(patients);
$("patients").innerHTML="";

      // Backend now searches only the selected city.
      // Display returned patients directly.
      const renderPatient=(x)=>{
        const b=document.createElement("button"); b.type="button"; b.className="patient-option";
        b.innerHTML=`<strong>${U.esc(x.name)}</strong><span class="patient-meta">${U.esc(x.age)} ${U.esc(x.ageUnit)} • ${U.esc(x.city)} • ${U.date(x.date)}</span>`;
        b.onclick=()=>{
          // Selecting another patient must remove any confirmation belonging to a previous patient.
          $("confirmation").hidden=true;
          $("confirmation").innerHTML="";
          $("submitStatus").textContent="";
          bookingSessionId++; bookingInProgress=false;
          selected=x; document.querySelectorAll(".patient-option").forEach(z=>z.classList.remove("selected")); b.classList.add("selected");
          $("selectedPatientName").textContent=U.title(x.name||"—");
          $("selectedPatientAge").textContent=`${x.age ?? "—"} ${x.ageUnit||""}`.trim();
          $("selectedPatientCity").textContent=x.city||"—";
          $("selectedPatientBookingDate").textContent=U.date(x.date)||"—";
          $("selectedPatientCard").hidden=false;
          $("name").value=U.title(x.name);
          // Follow-up patient details are locked after retrieval. Payment Mode
          // and OPD Charges remain editable; all other fields require Edit.
          if($("followWa") && !$("followWa").value) $("followWa").value=U.phone(x.whatsapp||x.phone||"");
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
          setFollowupFieldsLocked(true);
          // Payment mode and OPD charges are the only fields editable by default
          // in the Follow-up flow. The appointment can still be booked directly.
          ["payMode","amount","cash","online"].forEach(id=>{ if($(id)) $(id).disabled=false; });
          $("book").disabled=false;
          $("book").textContent="Book Appointment";
          const actions=$("editFollowup")?.closest(".followup-edit-actions");
          if(actions) actions.classList.remove("editing");
          const now=U.parts();calendarYear=now.y;calendarMonth=now.m;
          setFollowupDefaultDate($("city").value);
          requestAnimationFrame(()=>{
            $("selectedPatientCard").scrollIntoView({behavior:"smooth",block:"center"});
          });
        };
        return b;
      };

      patients.forEach((x)=>{
        $("patients").appendChild(renderPatient(x));
      });
if(patients.length===1) $("patients").querySelector(".patient-option").click();

      if(!patients.length){
        $("followStatus").textContent = r.notFound
          ? `No previous consultation found for ${p} in ${followCity}.`
          : "No patient found for this WhatsApp number.";
        $("followStatus").style.color="#b42318";
      }else{
        $("followStatus").textContent="";
        $("followStatus").style.color="";
      }
    }catch(e){
      $("followStatus").textContent="Unable to retrieve patient details: "+(e.message||"Network/server error.");
      $("followStatus").style.color="#b42318";
    }
    finally{
      // Retrieval is complete (success, no results, or error), so allow the
      // user to select a different retrieval city for the next Load.
      $("followCity").disabled=false;
      $("load").disabled=false;
      $("load").textContent="Load";
      $("load").className="btn btn-secondary";
    }
  };


  const lockBookingFields=(locked)=>{
    if(locked){
      document.querySelectorAll("#bookingFields input, #bookingFields select, #bookingFields textarea").forEach(el=>{
        el.disabled=true;
      });
    }
  };

  // Restore the form to the state before WhatsApp verification when a new
  // appointment is started from the confirmation box. Post-verification locks
  // remain controlled by setPostVerifyFieldsLocked().
  const unlockBeforeWhatsApp=()=>{
    document.querySelectorAll("#bookingFields input, #bookingFields select, #bookingFields textarea").forEach(el=>{
      el.disabled=false;
    });
    if($("book")){
      $("book").disabled=false;
      $("book").textContent="Book Appointment";
      $("book").className="cta";
    }
  };

  $("book").onclick=async()=>{
    if($("book").disabled || bookingInProgress)return;
    bookingInProgress=true;

    const resetAfterValidationError=()=>{
      bookingInProgress=false;
      $("book").disabled=false;
      $("book").textContent="Book Appointment";
      $("book").className="cta";
    };

    const payMode=$("payMode").value;
    const MAX_OPD_AMOUNT=2000;
    let c=0,o=0,total=0;
    const amountRaw=String($("amount")?.value ?? "").trim();
    const cashRaw=String($("cash")?.value ?? "").trim();
    const onlineRaw=String($("online")?.value ?? "").trim();
    const parsedAmount=amountRaw==="" ? NaN : Number(amountRaw);
    const parsedCash=cashRaw==="" ? NaN : Number(cashRaw);
    const parsedOnline=onlineRaw==="" ? NaN : Number(onlineRaw);

    // Payment validation is intentionally frontend-only. Empty numeric inputs
    // must never be coerced to zero by Number(value)||0, because an empty
    // payment field is not an accepted payment value.
    const paymentError=(message,fieldId)=>{
      $("submitStatus").textContent=message;
      $("submitStatus").style.color="#b42318";
      $(fieldId)?.focus();
      resetAfterValidationError();
      return true;
    };

    if(payMode==="Cash"){
      if(amountRaw==="") return paymentError("Please enter the cash amount.","amount");
      if(!Number.isFinite(parsedAmount) || parsedAmount<0 || parsedAmount>MAX_OPD_AMOUNT)
        return paymentError(`Cash amount must be between ₹0 and ₹${MAX_OPD_AMOUNT}.`,"amount");
      total=parsedAmount; c=parsedAmount;
    }else if(payMode==="Online"){
      if(amountRaw==="") return paymentError("Please enter the online amount.","amount");
      if(!Number.isFinite(parsedAmount) || parsedAmount<=0 || parsedAmount>MAX_OPD_AMOUNT)
        return paymentError(`Online amount must be more than ₹0 and no more than ₹${MAX_OPD_AMOUNT}.`,"amount");
      total=parsedAmount; o=parsedAmount;
    }else if(payMode==="Split"){
      if(cashRaw==="") return paymentError("Please enter the cash amount.","cash");
      if(onlineRaw==="") return paymentError("Please enter the online amount.","online");
      if(!Number.isFinite(parsedCash) || parsedCash<=0 || parsedCash>MAX_OPD_AMOUNT)
        return paymentError(`Cash amount must be more than ₹0 and no more than ₹${MAX_OPD_AMOUNT}.`,"cash");
      if(!Number.isFinite(parsedOnline) || parsedOnline<=0 || parsedOnline>MAX_OPD_AMOUNT)
        return paymentError(`Online amount must be more than ₹0 and no more than ₹${MAX_OPD_AMOUNT}.`,"online");
      c=parsedCash; o=parsedOnline; total=c+o;
      if(total>MAX_OPD_AMOUNT)
        return paymentError(`Combined Cash + Online amount cannot exceed ₹${MAX_OPD_AMOUNT}.`,"cash");
    }else{
      return paymentError("Please select a valid payment mode.","payMode");
    }

    const requiredFields=[
      ["name","Please enter the patient's name."],
      ["age","Please enter the patient's age."],
      ["address","Please enter the patient's address."],
      [type==="Follow-up"?"followWa":"wa","Please enter the patient's WhatsApp number."],
      ["city","Please select the visit location."],
      ["date","Please select an available appointment date."],
      ["next","Please select next follow-up city."]
    ];
    for(const [field,message] of requiredFields){
      if(!String($(field)?.value||$(field)?.dataset?.key||"").trim()){
        $("submitStatus").textContent=message;
        $("submitStatus").style.color="#b42318";
        $(field)?.focus();
        resetAfterValidationError();
        return;
      }
    }
    const bookingPhone=U.phone(type==="Follow-up"?$("followWa").value:$("wa").value);
    if(!/^[6-9]\d{9}$/.test(bookingPhone)){
      $("submitStatus").textContent="Enter a valid 10-digit WhatsApp number.";
      $("submitStatus").style.color="#b42318";
      $(type==="Follow-up"?"followWa":"wa")?.focus();
      resetAfterValidationError();
      return;
    }
    if(type==="New" && !verified){
      $("submitStatus").textContent="Please verify the WhatsApp number.";
      $("submitStatus").style.color="#b42318";
      $("verifyWa")?.focus();
      resetAfterValidationError();
      return;
    }
    if(total>2000){$("submitStatus").textContent="OPD total cannot exceed ₹2000.";$("submitStatus").style.color="#b42318";resetAfterValidationError();return;}
    if(total<0){$("submitStatus").textContent="Enter a valid OPD amount.";$("submitStatus").style.color="#b42318";resetAfterValidationError();return;}

    $("book").disabled=true;
    $("book").textContent="Confirming Appointment...";
    $("book").className="btn btn-primary";
    $("submitStatus").textContent="Wait We are Confirming your OPD Appointment...";
    $("submitStatus").style.color="#7b1fa2";

    // Lock fields only after all compulsory validation checks above pass.
    lockBookingFields(true);

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
      $("book").textContent="Book Appointment";
      $("book").className="cta";
      return;
    }

    try{
      // Local recovery journaling is best-effort only. It must NEVER block
      // the actual online booking request or leave the UI stuck on Confirming.
      try{
		  IDB.put("tx",{
		    id,
		    type:"OPD_BOOKING",
		    status:"pending",
		    payload
		  });
		}catch(_){}

      const currentBookingSession=bookingSessionId;
      const r=await NeuronAPI.call("bookAppointment",payload,25000);
      if(currentBookingSession!==bookingSessionId)return;
      try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"complete",payload,result:r});}catch(_){ }
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
      const confirmationHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Confirmed</h2><p class="city-confirm">For <b>${U.esc(payload.city||"")}</b> City</p><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(r.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${r.age} ${r.ageUnit}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(r.address||payload.address)}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(r.date)}</b></div><div class="confirm-row"><span>OPD Charges</span><b>${U.money(r.opdCharges)}</b></div><div class="confirm-row"><span>Cash</span><b>${U.money(r.opdCashPaid)}</b></div><div class="confirm-row"><span>Online</span><b>${U.money(r.opdOnlinePaid)}</b></div><div class="confirm-row"><span>Next Follow-up City</span><b>${U.esc(r.nextFollowupCity||payload.nextFollowupCity)}</b></div></div>`;
      resetFields("Follow-up");
      // resetFields intentionally clears the booking form, so restore the
      // confirmation content AFTER the reset.
      $("confirmation").innerHTML=confirmationHTML;
      $("confirmation").hidden=false;
      requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
    }catch(e){
      // The booking request may have reached the server even when the
      // original request failed locally. Verify the SAME request ID before
      // telling the patient to book again. verifyBooking performs at most
      // two checks with a 2-second delay between them.
      let recovered=false;
      try{
        const s=await NeuronAPI.verifyBooking(id,payload.city);
        if(s&&s.found){
          recovered=true;
          try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"complete",payload,result:s});}catch(_){ }
          const recoveredHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Confirmed</h2><p class="city-confirm">For <b>${U.esc(s.city||payload.city||"")}</b> City</p><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(s.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(s.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${s.age} ${U.esc(s.ageUnit||"")}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(s.address||payload.address||"")}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(s.date)}</b></div><div class="confirm-row"><span>OPD Charges</span><b>${U.money(s.opdCharges)}</b></div><div class="confirm-row"><span>Cash</span><b>${U.money(s.opdCashPaid)}</b></div><div class="confirm-row"><span>Online</span><b>${U.money(s.opdOnlinePaid)}</b></div><div class="confirm-row"><span>Next Follow-up City</span><b>${U.esc(s.nextFollowupCity||payload.nextFollowupCity||"")}</b></div></div>`;
          resetFields("Follow-up");
          $("confirmation").innerHTML=recoveredHTML;
          $("confirmation").hidden=false;
          $("submitStatus").textContent="✓ Booking recovered successfully.";
          $("submitStatus").style.color="#168a4a";
          requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
          return;
        }
      }catch(_){ }
      if(recovered)return;

      try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"uncertain",payload});}catch(_){ }

      // Give the patient exactly ONE manual recovery opportunity. The
      // handler never recreates this button after a failed check.
      $("submitStatus").innerHTML=`Checking booking status…<br><br><b>We couldn't confirm the appointment yet.</b><br>Your booking request has been safely saved.<br>Please do not create another booking.<br><button id="checkBookingAgain" type="button" class="btn btn-secondary" style="margin-top:12px">Check Again</button>`;
      $("submitStatus").style.color="#b42318";
      const checkAgain=$("checkBookingAgain");
      if(checkAgain){
        checkAgain.onclick=async()=>{
          checkAgain.disabled=true;
          checkAgain.textContent="Checking...";
          let found=false;
          try{
            const s=await NeuronAPI.verifyBooking(id,payload.city);
            if(s&&s.found){
              found=true;
              try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"complete",payload,result:s});}catch(_){ }
              const recoveredHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Confirmed</h2><p class="city-confirm">For <b>${U.esc(s.city||payload.city||"")}</b> City</p><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(s.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(s.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${s.age} ${U.esc(s.ageUnit||"")}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(s.address||payload.address||"")}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(s.date)}</b></div><div class="confirm-row"><span>OPD Charges</span><b>${U.money(s.opdCharges)}</b></div><div class="confirm-row"><span>Cash</span><b>${U.money(s.opdCashPaid)}</b></div><div class="confirm-row"><span>Online</span><b>${U.money(s.opdOnlinePaid)}</b></div><div class="confirm-row"><span>Next Follow-up City</span><b>${U.esc(s.nextFollowupCity||payload.nextFollowupCity||"")}</b></div></div>`;
              resetFields("Follow-up");
              $("confirmation").innerHTML=recoveredHTML;
              $("confirmation").hidden=false;
              $("submitStatus").textContent="✓ Booking recovered successfully.";
              $("submitStatus").style.color="#168a4a";
              requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
              return;
            }
          }catch(_){ }
          if(!found){
            // Definitive failure after the single manual Check Again.
            $("submitStatus").innerHTML=`<b>Booking unsuccessful.</b><br>Please book your OPD appointment again.`;
            $("submitStatus").style.color="#b42318";
            try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"failed",payload});}catch(_){ }
            $("book").disabled=false;
            $("book").textContent="Book Appointment";
            $("book").className="cta";
          }
        };
      }
    }finally{
      if($("confirmation").hidden){
        bookingInProgress=false;
        $("book").disabled=false;
        $("book").textContent="Book Appointment";
        $("book").className="cta";
      }
    }
  };

  initFollowupCity();
  fillCities();
  resetFields("New");
  setNextAvailableDate($("city").value);

  // Mobile browsers may restore a page from the back-forward cache with
  // stale button text. If no booking is actually running, normalize it.
  window.addEventListener("pageshow",()=>{
    if(!bookingInProgress){
      $("book").disabled=!verified;
      $("book").textContent="Book Appointment";
      $("book").className=verified?"cta":"cta";
    }
  });
});