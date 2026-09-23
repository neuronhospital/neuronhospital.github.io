document.addEventListener("DOMContentLoaded",()=>{
  const $=U.$, cities=Schedule.cities;
  DailyCity.init();
  let type="New", verified=false, selected=null;
  let nextFollowupCityManuallyEdited=false;
  let cityChangeToken=0;
  let bookingInProgress=false;
  let bookingSessionId=0;
  let followStatusTimer=null;


  // Show today's India-local date in the appointment field. The field is
  // display-only; OPD Booking accepts today as the only appointment date.
  const setTodayDateDisplay=()=>{
    const p=U.parts();
    $("date").value=String(p.d).padStart(2,"0")+"-"+String(p.m).padStart(2,"0")+"-"+p.y;
  };

  // Recalculate the patient's approximate current age from the age recorded
  // at the original registration date. Follow-up age is rounded to the
  // nearest whole number and the most appropriate unit is selected.
  // OPD Booking input validation: age must be 1 day through 100 years;
  // address requires at least 3 non-space characters; referral is optional
  // but, when supplied, also requires at least 3 non-space characters.
  const validateOpdPatientFields=()=>{
    const age=Number($("age").value);
    const unit=String($("unit").value||"").toLowerCase();
    let ageValid=Number.isFinite(age)&&age>=1&&["days","months","years"].includes(unit);
    if(ageValid){
      if(unit==="years") ageValid=age<=100;
      else if(unit==="months") ageValid=age<=1200;
      else {
        const now=U.parts();
        const today=new Date(Date.UTC(now.y,now.m-1,now.d));
        const maxBirth=new Date(Date.UTC(now.y-100,now.m-1,now.d));
        const maxDays=Math.round((today.getTime()-maxBirth.getTime())/86400000);
        ageValid=age<=maxDays;
      }
    }
    if(!ageValid)return ["age","Age must be between 1 day and 100 years."];

    const nonSpaceLength=value=>String(value||"").replace(/\s/g,"").length;
    if(nonSpaceLength($("address").value)<3)
      return ["address","Patient Address must contain at least 3 letters."];

    const referred=String($("ref").value||"");
    if(type==="New"&&nonSpaceLength(referred)>0&&nonSpaceLength(referred)<3)
      return ["ref","Referred By Dr./Hospital must contain at least 3 letters or leave it empty."];

    return null;
  };

  const currentFollowupAge=(age,ageUnit,registrationDate)=>{
    const n=Number(age);
    const raw=String(registrationDate||"");
    if(!Number.isFinite(n)||n<0||raw.length!==8)return{value:n,unit:ageUnit||"years"};

    const ry=Number(raw.slice(0,4)), rm=Number(raw.slice(4,6)), rd=Number(raw.slice(6,8));
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

  const todayKey=()=>{
    const p=U.parts();
    return p.y+String(p.m).padStart(2,"0")+String(p.d).padStart(2,"0");
  };
  const scheduleTodayKey=()=>{
    const p=U.parts();
    return String(p.d).padStart(2,"0")+String(p.m).padStart(2,"0")+p.y;
  };
  const scheduledCitiesForToday=()=>{
    const p=U.parts(),key=scheduleTodayKey();
    try{return cities.filter(c=>(Schedule.dates(c,p.y,p.m)||[]).includes(key));}catch(_){return [];}
  };
  const scheduledDefaultCityForToday=()=>{
    const allowed=scheduledCitiesForToday();
    const current=Schedule.cityAtNow(cities);
    return allowed.includes(current)?current:(allowed[0]||current||"Latur");
  };
  const getDefaultDailyCity=()=>{
    DailyCity.init();
    const saved=DailyCity.get();
    if(saved&&cities.includes(saved))return saved;
    return scheduledDefaultCityForToday();
  };

  const initFollowupCity=()=>{
    const el=$("followCity");
    if(!el)return;
    el.innerHTML=cities.map(c=>`<option value="${U.esc(c)}">${U.esc(c)}</option>`).join("");
    const daily=getDefaultDailyCity();
    if(daily)el.value=daily;
  };

  const updateCityOptions=()=>{
    const allowed=scheduledCitiesForToday();
    const special=DailyCity.isSpecial();
    $("city").querySelectorAll("option").forEach(o=>{
      const restricted=!special&&!allowed.includes(o.value);
      o.classList.toggle("restricted-city",restricted);
      o.classList.toggle("available-city",!restricted);
      o.dataset.restricted=restricted?"true":"false";
    });
    return {allowed,special};
  };
  const syncCityPickerTrigger=()=>{
    const trigger=$("cityPickerTrigger"),value=$("cityPickerValue"),city=$("city");
    if(trigger&&value&&city){value.textContent=city.value||"";trigger.disabled=!!city.disabled;trigger.setAttribute("aria-expanded",$("cityPickerModal")?.hidden?"false":"true");}
  };
  const closeCityPicker=()=>{
    const m=$("cityPickerModal");
    if(m){m.hidden=true;m.setAttribute("aria-hidden","true");}
    $("cityPickerTrigger")?.setAttribute("aria-expanded","false");
    document.body.classList.remove("opd-modal-open");
  };
  const renderCityPicker=()=>{
    const list=$("cityPickerList"),city=$("city");
    if(!list||!city)return;
    const {allowed,special}=updateCityOptions();
    const current=city.value;
    list.innerHTML=cities.map(c=>{
      const available=special||allowed.includes(c);
      const selected=c===current;
      return `<button type="button" class="city-picker-option ${available?"available":"restricted"} ${selected?"selected":""}" data-city="${U.esc(c)}" aria-label="${U.esc(c)}${available?" selectable":" restricted"}"><span>${U.esc(c)}</span><span class="city-picker-radio" aria-hidden="true"></span></button>`;
    }).join("");
    list.querySelectorAll("[data-city]").forEach(b=>b.onclick=()=>{
      const selectedCity=b.dataset.city||"";
      const allowedNow=scheduledCitiesForToday();
      const specialNow=DailyCity.isSpecial();
      closeCityPicker();
      if(!specialNow&&!allowedNow.includes(selectedCity)){showRestrictionPopup(selectedCity);return;}
      applyCitySelection(selectedCity);
    });
  };
  const openCityPicker=()=>{
    const trigger=$("cityPickerTrigger");
    if(!trigger||trigger.disabled)return;
    renderCityPicker();
    const m=$("cityPickerModal");
    if(m){m.hidden=false;m.setAttribute("aria-hidden","false");}
    trigger.setAttribute("aria-expanded","true");
    document.body.classList.add("opd-modal-open");
  };
  const applyCitySelection=(city)=>{
    if(!cities.includes(city))return;
    const token=++cityChangeToken;
    const allowed=scheduledCitiesForToday();
    const special=DailyCity.isSpecial();
    if(!special&&!allowed.includes(city)){showRestrictionPopup(city);return;}
    $("city").value=city;
    syncFollowupNextCityLock();
    const accessGranted=DailyCity.isSpecial();
    DailyCity.set(city,accessGranted||special);
    if(!nextFollowupCityManuallyEdited) $("next").value=city;
    syncCityPickerTrigger();
    setTodayDateDisplay();
    $("date").dataset.key=todayKey();
    void token;
  };
  const fillCities=()=>{
    $("city").innerHTML=cities.map(x=>`<option value="${U.esc(x)}">${U.esc(x)}</option>`).join("");
    $("next").innerHTML=cities.map(x=>`<option value="${U.esc(x)}">${U.esc(x)}</option>`).join("");
    const todayCity=getDefaultDailyCity();
    $("city").value=todayCity; $("next").value=todayCity;
    updateCityOptions();
    syncCityPickerTrigger();
  };

  const setFollowupStatus=(text,color="",autoHideMs=0)=>{
    if(followStatusTimer){clearTimeout(followStatusTimer);followStatusTimer=null;}
    const el=$("followStatus");
    if(!el)return;
    el.textContent=text||"";
    el.style.color=color||"";
    if(autoHideMs>0 && text){
      followStatusTimer=setTimeout(()=>{
        el.textContent="";
        el.style.color="";
        followStatusTimer=null;
      },autoHideMs);
    }
  };

  const resetFields=(mode)=>{
    type=mode; verified=false; selected=null;
    nextFollowupCityManuallyEdited=false;
    cityChangeToken++;
    bookingInProgress=false;
    $("follow").classList.toggle("active",mode==="Follow-up");
    $("new").classList.toggle("active",mode==="New");
    $("followFields").hidden=mode!=="Follow-up";
    $("followupCacheTools").hidden=mode!=="Follow-up";
    $("newFields").hidden=mode!=="New";
    const refField=$("ref")?.closest(".field"), nextField=$("next")?.closest(".field");
    if(refField)refField.hidden=mode!=="New";
    if(nextField)nextField.hidden=false;
    // In Follow-up mode, show only patient retrieval until a patient is selected.
    $("bookingFields").hidden=mode==="Follow-up";
    // The Follow-up flow uses followWa only for retrieval; the New-patient
    // WhatsApp field must remain hidden until New mode is selected.
    $("newWhatsAppField").hidden=mode==="Follow-up";

    ["followWa","name","age","address","ref","wa","verifyWa"].forEach(id=>{$(id).value="";});
    $("date").value="";
    delete $("date").dataset.key;
    $("unit").value="years";
    const todayCity=getDefaultDailyCity();
    $("city").value=todayCity;
    $("next").value=todayCity;

    if(mode==="New"){
      setTodayDateDisplay();
      $("date").dataset.key=todayKey();
    }

    updateCityOptions();
    syncCityPickerTrigger();
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
    setFollowupStatus(""); $("patients").innerHTML="";
    $("selectedPatientCard").hidden=true;
    $("selectedPatientName").textContent="—";
    $("selectedPatientAge").textContent="—";
    $("selectedPatientCity").textContent="—";
    $("selectedPatientBookingDate").textContent="—";
    $("submitStatus").textContent="";
    $("payMode").value="Cash"; $("amount").value="500"; $("cash").value=""; $("online").value="";
    updatePaymentUI();
  };

  const setPostVerifyFieldsLocked=(locked)=>{
    ["payMode","amount","cash","online","city","next"].forEach(id=>{
      if($(id)) $(id).disabled=locked;
    });
    if($("cityPickerTrigger")) $("cityPickerTrigger").disabled=locked;
    syncCityPickerTrigger();
    $("date").disabled=true;
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

  const syncFollowupNextCityLock=()=>{
    const next=$("next");
    if(!next)return;
    // In Follow-up mode, Next Follow-up City is directly editable when the
    // Visit Location is Latur. For every other Visit Location it stays behind
    // the existing Edit button until the user enters edit mode.
    const followupLocked=type==="Follow-up" && !!selected && $("city")?.dataset?.followupLocked==="true";
    const shouldLock=followupLocked && String($("city")?.value||"")!=="Latur";
    next.disabled=shouldLock;
    next.classList.toggle("followup-field-locked",shouldLock);
    next.dataset.followupLocked=shouldLock?"true":"false";
    const field=next.closest(".field");
    if(field)field.dataset.followupLocked=shouldLock?"true":"false";
  };

  const setFollowupFieldsLocked=(locked)=>{
    const ids=["name","age","unit","address","city","date"];
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
    if($("cityPickerTrigger")) $("cityPickerTrigger").disabled=locked;
    syncCityPickerTrigger();
    if($("editFollowup")) $("editFollowup").hidden=!locked;
    syncFollowupNextCityLock();
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
  // Confirmation-box display only. This does not alter payment processing or payloads.
  const confirmationPaymentFields_=(cash,online)=>{
    const c=Number(cash)||0,o=Number(online)||0;
    const cashField=`<div class="confirm-row"><span>Paid in Cash</span><b>${U.money(c)}</b></div>`;
    const onlineField=`<div class="confirm-row"><span>Paid Online</span><b>${U.money(o)}</b></div>`;
    if(c>=0&&o===0)return cashField;
    if(c===0&&o>0)return onlineField;
    if(c>0&&o>0)return cashField+onlineField;
    return cashField;
  };
  $("payMode").onchange=updatePaymentUI;
  $("cash").oninput=updateSplitTotal; $("online").oninput=updateSplitTotal;

  $("follow").onclick=()=>{
    resetFields("Follow-up");
    setTodayDateDisplay();
    $("date").dataset.key=todayKey();
    const followCity=$("followCity")?.value||"";
  };
  $("new").onclick=async()=>{
    resetFields("New");
    unlockBeforeWhatsApp();
  };

  $("wa").oninput=e=>{e.target.value=U.phone(e.target.value);checkWhatsAppMatch();};
  $("verifyWa").oninput=e=>{e.target.value=U.phone(e.target.value);checkWhatsAppMatch();};
  ["wa","verifyWa"].forEach(id=>{
    $(id).addEventListener("copy",e=>e.preventDefault());
    $(id).addEventListener("cut",e=>e.preventDefault());
    $(id).addEventListener("paste",e=>e.preventDefault());
  });
  $("followWa").oninput=e=>e.target.value=U.phone(e.target.value);

  $("next").onchange=()=>{
    nextFollowupCityManuallyEdited=true;
  };

  let pendingRestrictedCity="";
  let restrictionPreviousCity="";

  const closeCityRestrictionPopup=()=>{
    const m=$("opdRestrictionModal");
    if(m){m.hidden=true;m.setAttribute("aria-hidden","true");}
    document.body.classList.remove("opd-modal-open");
  };
  const closeSpecialAccessPopup=()=>{
    const m=$("specialAccessModal");
    if(m){m.hidden=true;m.setAttribute("aria-hidden","true");}
    document.body.classList.remove("opd-modal-open");
    if($("specialAccessPassword"))$("specialAccessPassword").value="";
    if($("specialAccessStatus"))$("specialAccessStatus").textContent="";
  };
  const restoreDefaultCity=()=>{
    const c=getDefaultDailyCity();
    $("city").value=c;
    if(!nextFollowupCityManuallyEdited)$("next").value=c;
    syncFollowupNextCityLock();
    updateCityOptions();
    syncCityPickerTrigger();
    setTodayDateDisplay();
    $("date").dataset.key=todayKey();
  };
  const showRestrictionPopup=(attempted)=>{
    pendingRestrictedCity=attempted||"";
    restrictionPreviousCity=getDefaultDailyCity();
    $("city").value=restrictionPreviousCity;
    updateCityOptions();
    syncCityPickerTrigger();
    const m=$("opdRestrictionModal");
    if(m){m.hidden=false;m.setAttribute("aria-hidden","false");document.body.classList.add("opd-modal-open");}
  };
  const showSpecialAccessPopup=()=>{
    const m=$("specialAccessModal");
    if(m){m.hidden=false;m.setAttribute("aria-hidden","false");document.body.classList.add("opd-modal-open");}
    const input=$("specialAccessPassword");
    if(input){input.value="";requestAnimationFrame(()=>input.focus({preventScroll:true}));}
  };
  const sha256=async(text)=>{
    const data=new TextEncoder().encode(String(text||""));
    const hash=await crypto.subtle.digest("SHA-256",data);
    return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
  };
  const verifySpecialAccess=async()=>{
    const input=$("specialAccessPassword"),status=$("specialAccessStatus");
    const value=String(input?.value||"").replace(/\D/g,"").slice(0,8);
    if(input)input.value=value;
    if(value.length!==8){
      if(status)status.textContent="Enter Correct Password";
      return false;
    }
    try{
      const ok=(await sha256(value))==="114f4b4bbf1f4a3a58064199f0e9d241566f356756ee58e5d160d3937e6ac740";
      if(!ok){
        if(status)status.textContent="Enter Correct Password";
        return false;
      }
      const target=pendingRestrictedCity&&cities.includes(pendingRestrictedCity)?pendingRestrictedCity:getDefaultDailyCity();
      DailyCity.set(target,true);
      $("city").value=target;
      syncFollowupNextCityLock();
      updateCityOptions();
      syncCityPickerTrigger();
      closeSpecialAccessPopup();
      pendingRestrictedCity="";
      setTodayDateDisplay(); $("date").dataset.key=todayKey();
      if(!nextFollowupCityManuallyEdited)$("next").value=target;
      return true;
    }catch(_){
      if(status)status.textContent="Unable to verify password. Please try again.";
      return false;
    }
  };

  $("opdRestrictionOk")?.addEventListener("click",()=>{
    closeCityRestrictionPopup();
    pendingRestrictedCity="";
    restoreDefaultCity();
  });
  $("opdRestrictionSpecial")?.addEventListener("click",()=>{
    closeCityRestrictionPopup();
    showSpecialAccessPopup();
  });
  $("specialAccessCancel")?.addEventListener("click",()=>{
    closeSpecialAccessPopup();
    pendingRestrictedCity="";
    restoreDefaultCity();
  });
  $("specialAccessVerify")?.addEventListener("click",verifySpecialAccess);
  $("specialAccessPassword")?.addEventListener("input",e=>{
    e.target.value=e.target.value.replace(/\D/g,"").slice(0,8);
    if(e.target.value.length===8)verifySpecialAccess();
  });
  [$("opdRestrictionModal"),$("specialAccessModal")].forEach(m=>m?.addEventListener("click",e=>{
    if(e.target===m){
      if(m.id==="opdRestrictionModal"){
        closeCityRestrictionPopup(); pendingRestrictedCity=""; restoreDefaultCity();
      }else{
        closeSpecialAccessPopup(); pendingRestrictedCity=""; restoreDefaultCity();
      }
    }
  }));
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"){
      if(!$("cityPickerModal")?.hidden){closeCityPicker();}
      else if(!$("specialAccessModal")?.hidden){closeSpecialAccessPopup();pendingRestrictedCity="";restoreDefaultCity();}
      else if(!$("opdRestrictionModal")?.hidden){closeCityRestrictionPopup();pendingRestrictedCity="";restoreDefaultCity();}
    }
  });

  $("cityPickerTrigger")?.addEventListener("click",openCityPicker);
  $("cityPickerModal")?.addEventListener("click",e=>{if(e.target===$("cityPickerModal")||e.target.classList.contains("opd-access-backdrop"))closeCityPicker();});
  $("city").onchange=()=>syncCityPickerTrigger();

  const setRebuildFollowupConfirmVisible=(visible)=>{
    const modal=$("rebuildFollowupConfirmModal");
    if(!modal)return;
    modal.hidden=!visible;
    modal.setAttribute("aria-hidden",visible?"false":"true");
    document.body.classList.toggle("opd-modal-open",visible);
  };

  const runRebuildFollowupCache=async()=>{
    const city=String($("followCity")?.value||"").trim();
    if(!city)return;
    const button=$("rebuildFollowupCache");
    button.disabled=true;
    setRebuildFollowupConfirmVisible(false);
    setFollowupStatus("Checking Follow-up cache…","#7b1fa2");
    try{
      const r=await IDB.rebuildFollowupCityCache_(city);
      if(r?.mode==="INCREMENTAL"){
        setFollowupStatus(`Follow-up cache updated — ${r.rowsReceived||0} rows checked. ${r.rowsInserted||0} new, ${r.rowsUpdated||0} updated.`,"#168a4a",3000);
      }else if(r?.mode==="ALREADY_CURRENT"){
        setFollowupStatus("Follow-up cache already up to date.","#168a4a",3000);
      }else if(r?.mode==="FULL_BUILD"){
        setFollowupStatus(`Follow-up cache rebuilt — ${r.rowsLoaded||0} records loaded.`,"#168a4a",3000);
      }else if(r?.mode==="IN_PROGRESS"){
        setFollowupStatus("Cache synchronization is already in progress.","#b54708",3000);
      }else{
        throw new Error(r?.error||"Follow-up cache synchronization failed.");
      }
    }catch(e){
      setFollowupStatus("Follow-up cache synchronization failed. Please try again.","#b42318",3000);
    }finally{
      button.disabled=false;
    }
  };

  $("rebuildFollowupCache")?.addEventListener("click",()=>{
    // Strictly client-side: do not invoke the rebuild operation until Yes is clicked.
    setRebuildFollowupConfirmVisible(true);
  });
  $("rebuildFollowupConfirmYes")?.addEventListener("click",()=>runRebuildFollowupCache());
  $("rebuildFollowupConfirmNo")?.addEventListener("click",()=>setRebuildFollowupConfirmVisible(false));

  $("load").onclick=async()=>{
    if(followStatusTimer){clearTimeout(followStatusTimer);followStatusTimer=null;}
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
      $("load").textContent="Search Patient";
      $("load").className="btn btn-secondary";
      return;
    }
    $("load").disabled=true;
    $("load").textContent="Searching...";
    $("load").className="btn btn-primary";
    $("followStatus").textContent="Wait We are Loading Patient details...";
    $("followStatus").style.color="#7b1fa2";
    try{
      const followCity=$("followCity")?$("followCity").value:"";
const followupResult = await IDB.getOrBuildFollowupPatients_(followCity,p);
      const patients = Array.isArray(followupResult?.patients)?followupResult.patients:[];
      const r={notFound:patients.length===0,authoritativeNegative:followupResult?.authoritativeNegative===true};
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
          $("address").value=U.title(x.address||""); $("ref").value="";
          // Follow-up Visit Location defaults to today's DailyCity, but remains editable.
          const dailyCity=getDefaultDailyCity();
          $("city").value=dailyCity;
          syncCityPickerTrigger();
          updateCityOptions();
          // Follow-up Next Follow-up City defaults to the previously selected
          // value from the historical Follow-up record (Column K), and remains
          // independently editable by the user.
          nextFollowupCityManuallyEdited=false;
          $("next").value=String(x.nextFollowupCity||"");
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
          setTodayDateDisplay();
          $("date").dataset.key=todayKey();
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
          ? (r.authoritativeNegative
            ? `Patient not found in the last 2 years of Follow-up records in ${followCity}. Please book a new appointment.`
            : `No previous consultation found for ${p} in ${followCity}.`)
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
      $("load").textContent="Search Patient";
      $("load").className="btn btn-secondary";
    }
  };


  let bookingFieldLockSnapshot=null;
  const lockBookingFields=(locked)=>{
    const controls=[...document.querySelectorAll("#bookingFields input, #bookingFields select, #bookingFields textarea")];
    if(locked){
      // Snapshot the pre-submission UI state so an API error/timeout can
      // restore exactly what the receptionist was allowed to edit before
      // submission. This is safer than trying to reconstruct the state from
      // the current verification/follow-up flags after an error.
      bookingFieldLockSnapshot=new Map(controls.map(el=>[el,{disabled:el.disabled,readOnly:el.readOnly,pointerEvents:el.style.pointerEvents}]));
      controls.forEach(el=>{el.disabled=true;});
      if($("cityPickerTrigger")) $("cityPickerTrigger").disabled=true;
      syncCityPickerTrigger();
      return;
    }

    if(bookingFieldLockSnapshot){
      bookingFieldLockSnapshot.forEach((state,el)=>{
        el.disabled=state.disabled;
        el.readOnly=state.readOnly;
        el.style.pointerEvents=state.pointerEvents;
      });
      bookingFieldLockSnapshot=null;
      syncCityPickerTrigger();
      return;
    }

    // No submission snapshot exists (for example after a recovery-prefill
    // navigation). Fall back to the normal pre-WhatsApp state.
    unlockBeforeWhatsApp();
    setPostVerifyFieldsLocked(!verified);
  };


  // Restore only the fields that are editable before WhatsApp verification.
  // Post-verification fields remain locked until WhatsApp is successfully verified.
  const unlockBeforeWhatsApp=()=>{
    ["name","age","unit","address","ref","wa","verifyWa"].forEach(id=>{
      if($(id)) $(id).disabled=false;
    });
  };

  const isOutsideUsualConsultationHours=()=>{
    const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
    const get=n=>+(parts.find(x=>x.type===n)?.value||0);
    const minutes=get("hour")*60+get("minute");
    return minutes<9*60 || minutes>21*60;
  };

  const AFTER_HOURS_ACK_KEY="NEURON_OPD_AFTER_HOURS_ACK_DATE";
  const hasTodayAfterHoursAcknowledgement=()=>{
    try{return localStorage.getItem(AFTER_HOURS_ACK_KEY)===todayKey();}catch(_){return false;}
  };
  const storeTodayAfterHoursAcknowledgement=()=>{
    try{localStorage.setItem(AFTER_HOURS_ACK_KEY,todayKey());}catch(_){}
  };

  const showConsultationHoursNote=()=>new Promise(resolve=>{
    const modal=$("opdHoursNoteModal");
    if(!modal){storeTodayAfterHoursAcknowledgement();resolve(true);return;}
    const finish=proceed=>{
      modal.hidden=true;
      modal.setAttribute("aria-hidden","true");
      document.body.classList.remove("opd-modal-open");
      if(proceed)storeTodayAfterHoursAcknowledgement();
      resolve(proceed);
    };
    modal.hidden=false;
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("opd-modal-open");
    $("opdHoursNoteCancel")?.addEventListener("click",()=>finish(false),{once:true});
    $("opdHoursNoteProceed")?.addEventListener("click",()=>finish(true),{once:true});
  });

  $("book").onclick=async()=>{
    if($("book").disabled || bookingInProgress)return;

    $("confirmation").hidden=true;
    $("confirmation").innerHTML="";

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

    const fieldValidationError=validateOpdPatientFields();
    if(fieldValidationError){
      const [field,message]=fieldValidationError;
      $("submitStatus").textContent=message;
      $("submitStatus").style.color="#b42318";
      $(field)?.focus();
      resetAfterValidationError();
      return;
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
    const recoveryPatientName=U.title($("name").value);
    if(await window.NeuronRecovery?.isPatientRecovering?.({name:recoveryPatientName,whatsapp:bookingPhone,city:$("city").value,appointmentDate:$("date").dataset.key})){
      $("submitStatus").textContent=`${recoveryPatientName} has a pending appointment. The system is recovering the appointment status. Please wait for the recovery status to update before booking this patient again.`;
      $("submitStatus").style.color="#7b1fa2";
      return;
    }
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

    if(isOutsideUsualConsultationHours() && !hasTodayAfterHoursAcknowledgement()){
      const proceed=await showConsultationHoursNote();
      if(!proceed){resetAfterValidationError();return;}
    }

    $("book").disabled=true;
    $("book").textContent="Confirming Appointment...";
    $("book").className="btn btn-primary";
    if(type==="Follow-up"){
      // Once the validated Follow-up booking is submitted, remove Edit
      // immediately and let the confirmation button occupy the full row.
      if($("editFollowup")) $("editFollowup").hidden=true;
      const actions=$("editFollowup")?.closest(".followup-edit-actions");
      if(actions) actions.classList.add("editing");
    }
    $("submitStatus").textContent="Wait We are Confirming your OPD Appointment...";
    $("submitStatus").style.color="#7b1fa2";

    // Lock fields only after all compulsory validation checks above pass.
    lockBookingFields(true);

    const id=U.requestId8();
    const startedAt=Date.now(),timeoutMs=15000;
    const payload={
      bookingRequestId:id,
      childName:U.title($("name").value),
      age:Number($("age").value),
      ageUnit:$("unit").value,
      address:U.title($("address").value),
      referredBy:type==="New"?U.title($("ref").value):"",
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
        await IDB.put("tx",{
          id,
          type:"OPD_BOOKING",
          status:"pending",
          startedAt,
          timeoutMs,
          payload
        });
      }catch(_){}

      const currentBookingSession=bookingSessionId;
      const r=await NeuronAPI.call("bookAppointment",payload,timeoutMs);
      if(currentBookingSession!==bookingSessionId)return;
      try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"complete",payload,result:r});}catch(_){ }
      try{await window.syncSuccessfulBookingToTodayCaches_?.({kind:"OPD_BOOKING",rowNumber:r.rowNumber,appointmentId:r.appointmentId||"",date:r.date||payload.appointmentDate,time:r.time||"",patientName:r.patientName||payload.childName,age:r.age??payload.age,ageUnit:r.ageUnit||payload.ageUnit,address:r.address??payload.address,patientType:r.patientType||payload.patientType,whatsapp:payload.whatsapp,city:r.city||payload.city,referredBy:r.referredBy??payload.referredBy,nextFollowupCity:r.nextFollowupCity??payload.nextFollowupCity,bookingRequestId:id,opdCharges:r.opdCharges??payload.opdCharges,opdCashPaid:r.opdCashPaid??payload.opdCashPaid,opdOnlinePaid:r.opdOnlinePaid??payload.opdOnlinePaid,opdTotalPaid:r.opdTotalPaid??(Number(payload.opdCashPaid)||0)+(Number(payload.opdOnlinePaid)||0)});}catch(_){ }
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
      const confirmationHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Confirmed</h2><p class="city-confirm">For <b>${U.esc(payload.city||"")}</b> City</p><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(r.appointmentId)}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(r.patientName)}</b></div><div class="confirm-row"><span>Age</span><b>${r.age} ${r.ageUnit}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(r.address||payload.address)}</b></div><div class="confirm-row"><span>Mobile Number</span><b>${U.esc(payload.whatsapp||r.whatsapp||"")}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(r.date)}</b></div><div class="confirm-row"><span>OPD Charges</span><b>${U.money(r.opdCharges)}</b></div>${confirmationPaymentFields_(r.opdCashPaid,r.opdOnlinePaid)}<div class="confirm-row"><span>Next Follow-up City</span><b>${U.esc(r.nextFollowupCity||payload.nextFollowupCity)}</b></div></div>`;
      resetFields("New");
      // resetFields intentionally clears the booking form, so restore the
      // confirmation content AFTER the reset.
      $("confirmation").innerHTML=confirmationHTML;
      $("confirmation").hidden=false;
      // Prepare the form for the next New appointment only after the current
      // booking confirmation is visible. Unlock fields through WhatsApp only;
      // post-verification fields remain locked until WhatsApp is verified.
      unlockBeforeWhatsApp();
      setPostVerifyFieldsLocked(true);
      requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
    }catch(e){
      // The request outcome is unknown until the exact request ID is verified.
      // Keep it in IndexedDB and let the shared recovery service reconcile it
      // in the background; never blindly recreate the booking.
      try{await IDB.put("tx",{id,type:"OPD_BOOKING",status:"uncertain",payload});}catch(_){ }
      try{window.NeuronRecovery?.reconcilePendingBookings?.();}catch(_){ }

      $("submitStatus").textContent="🔄 Checking appointment status…";
      $("submitStatus").style.color="#7b1fa2";
      bookingInProgress=false;
      $("book").disabled=false;
      $("book").textContent="Book Appointment";
      $("book").className="cta";
      lockBookingFields(false);
    }finally{
      if($("confirmation").hidden && !bookingInProgress){
        $("book").disabled=false;
        $("book").textContent="Book Appointment";
        $("book").className="cta";
      }
    }
  };

  window.addEventListener("neuron:recovery-result",e=>{
    const d=e.detail||{};
    if(d.type!=="OPD_BOOKING")return;
    const currentName=U.title($("name")?.value||"");
    const currentPhone=U.phone($(type==="Follow-up"?"followWa":"wa")?.value||"");
    const samePatient=String(d.patientName||"").trim().replace(/\s+/g," ").toLowerCase()===String(currentName||"").trim().replace(/\s+/g," ").toLowerCase() && (!currentPhone || U.phone(d.payload?.whatsapp||"")===currentPhone);
    if(!samePatient)return;
    if(d.status==="recovered"){
      const result=d.result||{};
      const recoveryPayload=d.payload||{};
      const confirmationHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Appointment Confirmed</h2><p class="city-confirm">For <b>${U.esc(result.city||recoveryPayload.city||"")}</b> City</p><div class="confirm-row"><span>Appointment ID</span><b>${U.esc(result.appointmentId||"")}</b></div><div class="confirm-row"><span>Patient</span><b>${U.esc(result.patientName||d.patientName||currentName)}</b></div><div class="confirm-row"><span>Age</span><b>${U.esc(result.age??recoveryPayload.age??"")} ${U.esc(result.ageUnit||recoveryPayload.ageUnit||"")}</b></div><div class="confirm-row"><span>Address</span><b>${U.esc(result.address||recoveryPayload.address||"")}</b></div><div class="confirm-row"><span>Mobile Number</span><b>${U.esc(result.whatsapp||recoveryPayload.whatsapp||d.payload?.whatsapp||"")}</b></div><div class="confirm-row"><span>Date of Booking</span><b>${U.date(result.date||recoveryPayload.appointmentDate||"")}</b></div><div class="confirm-row"><span>OPD Charges</span><b>${U.money(result.opdCharges??recoveryPayload.opdCharges)}</b></div>${confirmationPaymentFields_(result.opdCashPaid??recoveryPayload.opdCashPaid,result.opdOnlinePaid??recoveryPayload.opdOnlinePaid)}<div class="confirm-row"><span>Next Follow-up City</span><b>${U.esc(result.nextFollowupCity||recoveryPayload.nextFollowupCity||"")}</b></div></div>`;
      resetFields("New");
      $("confirmation").innerHTML=confirmationHTML;
      $("confirmation").hidden=false;
      unlockBeforeWhatsApp();
      setPostVerifyFieldsLocked(true);
      $("submitStatus").textContent="✓ Appointment submitted successfully.";
      $("submitStatus").style.color="#168a4a";
      bookingInProgress=false;
      requestAnimationFrame(()=>$("confirmation").scrollIntoView({behavior:"smooth",block:"center"}));
    }else if(d.status==="failed"){
      $("submitStatus").textContent=`✕ Appointment failed for ${currentName}. You can book the appointment again.`;
      $("submitStatus").style.color="#b42318";
      $("confirmation").innerHTML=`<div class="card"><h2>Appointment failed</h2><p>Appointment failed for <b>${U.esc(currentName)}</b>.</p><p>You can book the appointment again.</p></div>`;
      $("confirmation").hidden=false;
      bookingInProgress=false;
      lockBookingFields(false);
      $("book").disabled=false;
      $("book").textContent="Book Appointment";
      $("book").className="cta";
    }
  });

  initFollowupCity();
  fillCities();
  resetFields("New");
  const applyRecoveryPrefill=()=>{
    let r=null;
    try{r=JSON.parse(localStorage.getItem("neuronRecoveryPrefillV1")||"null")}catch(_){r=null}
    if(!r||r.type!=="OPD_BOOKING")return;
    const p=r.payload||{};
    resetFields("New");
    const set=(id,v)=>{if($(id)&&v!==undefined&&v!==null)$(id).value=String(v)};
    set("name",p.childName||p.patientName); set("age",p.age); set("unit",p.ageUnit||"years");
    set("address",p.address); set("ref",p.referredBy); set("wa",p.whatsapp); set("city",p.city); set("next",p.nextFollowupCity);
    updateCityOptions(); syncCityPickerTrigger();
    if($("date")){setTodayDateDisplay();$("date").dataset.key=todayKey();$("date").disabled=true;}
    verified=false;
    setPostVerifyFieldsLocked(true);
    lockBookingFields(false);
    try{localStorage.removeItem("neuronRecoveryPrefillV1")}catch(_){}
    if($("submitStatus")){ $("submitStatus").textContent="Patient details pre-filled from the failed recovery. Please review the details and submit a new booking."; $("submitStatus").style.color="#7b1fa2"; }
  };

  applyRecoveryPrefill();
  setTodayDateDisplay();
  $("date").dataset.key=todayKey();
  $("date").disabled=true;

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