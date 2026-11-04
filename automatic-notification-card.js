"use strict";

(() => {
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const MARATHI = {
    Latur: ["लातूर", "लातूरची"], Nilanga: ["निलंगा", "निलंग्याची"], Udgir: ["उदगीर", "उदगीरची"],
    Beed: ["बीड", "बीडची"], Ambajogai: ["अंबाजोगाई", "अंबाजोगाईची"],
    Dharashiv: ["धाराशिव", "धाराशिवची"], Omerga: ["उमरगा", "उमरग्याची"], Barshi: ["बार्शी", "बार्शीची"]
  };
  const HOURS = { Latur: ["9 AM - 9 PM", "3 PM - 9 PM"], Nilanga: "9 AM - 1 PM", Udgir: "9 AM - 5 PM", Beed: "9 AM - 5 PM", Ambajogai: "9 AM - 6 PM", Dharashiv: "9 AM - 1 PM", Omerga: "9 AM - 1 PM", Barshi: "3 PM - 5 PM" };
  const WEEKDAYS = ["रविवार", "सोमवार", "मंगळवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];
  const MONTHS = ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"];
  const zone = "Asia/Kolkata";
  const el = (id) => document.getElementById(id);
  const canonical = (city) => CITIES.find((c) => String(city || "").trim().toLowerCase() === c.toLowerCase()) || "";
  function indiaToday() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return new Date(Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day)));
  }
  function dateKey(date) { return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCDate()).padStart(2,"0")}`; }
  function dateIso(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`; }
  function addDays(date, n) { const d = new Date(date); d.setUTCDate(d.getUTCDate()+n); return d; }
  function weekOfMonth(date) { return Math.floor((date.getUTCDate()-1)/7)+1; }
  function scheduled(city, d) {
    const weekday=d.getUTCDay(), week=weekOfMonth(d);
    switch(city) {
      case "Latur": return [1,2,3,5,6].includes(weekday) || ((weekday===4||weekday===0)&&week===5);
      case "Nilanga": return weekday===6&&week===1;
      case "Udgir": return weekday===0&&[2,4].includes(week);
      case "Beed": return weekday===4&&[2,4].includes(week);
      case "Ambajogai": return weekday===0&&[1,3].includes(week);
      case "Dharashiv": return weekday===4&&[1,3].includes(week);
      case "Barshi": return weekday===4&&[1,3].includes(week);
      case "Omerga": return weekday===6&&week>=2&&week<=5;
      default: return false;
    }
  }
  function visitStart(city, date) { return (city === "Latur" && date.getUTCDay() === 6) || city === "Barshi" ? 900 : 540; }
  function specialVisit(config) {
    const s=config && config.specialAccess;
    if (!s || s.enabled!==true || !canonical(s.city) || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date||""))) return null;
    const date=new Date(`${s.date}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || dateIso(date)!==s.date ? null : {city:canonical(s.city),date};
  }
  function cancelledDates(config) {
    const raw=config && config.doctorVisitCancelled;
    const result={};
    CITIES.forEach(city=>{
      const vals=raw && raw[city];
      result[city]=new Set(Array.isArray(vals)?vals.map(v=>String(v).trim()).filter(v=>/^\d{8}$/.test(v)):[]);
    });
    return result;
  }
  function findFirst(from, days, allowed, special, cancellations, includeCancelled) {
    for(let offset=0;offset<=days;offset++) {
      const date=addDays(from,offset), scheduledCities=CITIES.filter(c=>scheduled(c,date));
      if(special && dateIso(special.date)===dateIso(date) && !scheduledCities.includes(special.city)) scheduledCities.push(special.city);
      const candidates=scheduledCities.filter(c=>allowed.includes(c)).map(city=>({city,date,isCancelled:cancellations[city].has(dateKey(date)),start:visitStart(city,date)}));
      candidates.sort((a,b)=>a.start-b.start || Number(b.isCancelled)-Number(a.isCancelled) || CITIES.indexOf(a.city)-CITIES.indexOf(b.city));
      const found=candidates.find(c=>includeCancelled || !c.isCancelled);
      if(found) return found;
    }
    return null;
  }
  function formatMarathi(date) { return `${WEEKDAYS[date.getUTCDay()]}, दि. ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`; }
  function hours(city,date) { const h=HOURS[city]; return Array.isArray(h)?h[date.getUTCDay()===6?1:0]:h||""; }
  function laturClosureType(today) {
    const occurrence=weekOfMonth(today);
    if(occurrence!==2 && occurrence!==4) return "";
    if(today.getUTCDay()===4) return "THURSDAY";
    if(today.getUTCDay()===0) return "SUNDAY";
    return "";
  }
  function resolveModel() {
    const config=window.neuronOpdConfig;
    // The verified configuration snapshot is published by the OPD module.
    if(!config) return null;
    const user=window.neuronActiveUser;
    const city=canonical(user && user.city);
    const allowed=!user || user.admin===true || city==="Latur" || !city ? CITIES : [city];
    const today=indiaToday(), special=specialVisit(config), cancellations=cancelledDates(config);
    const first=findFirst(today,366,allowed,special,cancellations,true);
    let model=null;
    if(first) {
      if(!first.isCancelled) model={...first,nextVisitDate:null,today};
      else {
        const next=findFirst(addDays(first.date,1),366,[first.city],special,cancellations,false);
        model={...first,nextVisitDate:next && next.date,today};
      }
    }
    // Android displays a separate Latur-main-hospital closure notice on the
    // second/fourth Thursday or Sunday when another city has a visit that day.
    const laturContext=!!user && city==="Latur";
    const closureType=laturContext ? laturClosureType(today) : "";
    if(closureType && !(model && model.isCancelled && model.date.getTime()===today.getTime())) {
      const closureVisit=findFirst(today,0,CITIES,special,cancellations,false);
      if(closureVisit && closureVisit.city!=="Latur") {
        return {...closureVisit,nextVisitDate:null,today,laturClosure:closureType};
      }
    }
    return model;
  }
  function dismissalKey(model) { return `neuronAutoVisitDismissed_v1_${model.city}_${dateKey(model.date)}`; }
  function safeText(parent,text,tag="div",className="") { const node=document.createElement(tag); node.textContent=text; if(className) node.className=className; parent.append(node); return node; }
  function render() {
    const card=el("autoNotificationCard"), content=el("autoNotificationContent");
    if(!card||!content) return;
    const model=resolveModel();
    if(!model) { card.hidden=true; return; }
    try { if(localStorage.getItem(dismissalKey(model))==="1") { card.hidden=true; return; } } catch(_) {}
    content.replaceChildren();
    const cityName=(MARATHI[model.city]||[model.city])[0], possessive=(MARATHI[model.city]||[model.city,`${cityName}ची`])[1];
    const isLatur=model.city==="Latur";
    if(model.isCancelled) safeText(content,"Visit cancelled","div","auto-notification-status");
    if(model.laturClosure) {
      safeText(content,`डॉ. अंकुश मैंदाड यांची ${cityName} visit असल्यामुळे आज ${formatMarathi(model.today)} रोजी न्यूरॉन हॉस्पिटल लातूर बंद राहील.`);
      safeText(content,model.laturClosure==="THURSDAY"?"उद्या शुक्रवारी हॉस्पिटल पूर्णवेळ चालू आहे":"उद्या सोमवारी हॉस्पिटल पूर्णवेळ चालू आहे");
    } else if(isLatur) {
      safeText(content,"डॉ. अंकुश मैंदाड, Pediatric Neurologist","div","auto-notification-title");
      const hoursText=model.today.getUTCDay()===6?"3 PM - 9 PM":"9 AM - 9 PM";
      safeText(content,`न्यूरॉन हॉस्पिटल लातूर येथे दररोज उपलब्ध (${hoursText})`);
      safeText(content,"(गुरु/रविवार बंद)","small","auto-notification-closed");
    } else {
      safeText(content,`डॉ. अंकुश मैंदाड यांची ${cityName} भेट`,"div","auto-notification-title");
    }
    if(model.isCancelled) {
      safeText(content,`${possessive} (${formatMarathi(model.date)}) नियोजित भेट रद्द करण्यात आली आहे.`);
      if(model.nextVisitDate) safeText(content,`🗓️ पुढील भेटीची तारीख : ${formatMarathi(model.nextVisitDate)}`,"div","auto-notification-date");
    } else if(!isLatur && !model.laturClosure) {
      const dateLabel=model.date.getTime()===model.today.getTime()?"आज":model.date.getTime()===addDays(model.today,1).getTime()?"उद्या":"पुढील Visit";
      const dateText=formatMarathi(model.date), time=hours(model.city,model.date);
      const datePrefix=dateLabel==="पुढील Visit"?"पुढील Visit : ":`${dateLabel}, `;
      safeText(content,`🗓️ ${datePrefix}${dateText} (${time})`,"div","auto-notification-date");
    }
    const contact=model.laturClosure?"02382 242581":({Latur:"02382 242581",Nilanga:"9172515151",Udgir:"7821960813",Beed:"9359449022",Ambajogai:"9075246888",Dharashiv:"9405788011",Barshi:"8010824285",Omerga:"7414955139"}[model.city]);
    const row=document.createElement("div"); row.className="auto-notification-contact";
    safeText(row,"📞 नाव नोंदणीसाठी संपर्क :");
    const link=document.createElement("a"); link.href=`tel:${contact}`; link.textContent=contact; row.append(link); content.append(row);
    card.classList.toggle("is-cancelled",model.isCancelled); card.hidden=false;
    const close=el("autoNotificationDismiss"); if(close) close.onclick=()=>{try{localStorage.setItem(dismissalKey(model),"1");}catch(_){} card.hidden=true;};
  }
  window.NeuronAutomaticNotificationCard={render};
  document.addEventListener("DOMContentLoaded",render);
  window.addEventListener("hashchange",render);
})();
