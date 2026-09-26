/* DailyCity: today's actual OPD operating city, written only by OPD Booking. */
window.DailyCity=window.DailyCity||(()=>{
  const CURRENT_KEY="neuron_daily_city";
  const HISTORY_KEY="neuron_daily_city_history";
  const parts=()=>window.U?.parts?U.parts():{d:new Date().getDate(),m:new Date().getMonth()+1,y:new Date().getFullYear()};
  const dateKey=(p)=>`${p.y}-${String(p.m).padStart(2,"0")}-${String(p.d).padStart(2,"0")}`;
  const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||"");return v??fallback}catch(_){return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}};
  const remove=(key)=>{try{localStorage.removeItem(key)}catch(_){}};
  const relativeKeys=()=>{
    const p=parts(),base=new Date(Date.UTC(p.y,p.m-1,p.d));
    const out=[];
    for(let i=1;i<=2;i++){const d=new Date(base);d.setUTCDate(d.getUTCDate()-i);out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`);}
    return out;
  };
  const init=()=>{
    const today=dateKey(parts());
    let history=read(HISTORY_KEY,{});
    const current=read(CURRENT_KEY,null);
    if(current&&current.date&&current.date!==today&&current.city){
      history[current.date]={city:String(current.city),special:current.special===true};
      remove(CURRENT_KEY);
    }
    const keep=relativeKeys(),trimmed={};
    keep.forEach(k=>{if(history&&history[k]&&history[k].city)trimmed[k]=history[k];});
    write(HISTORY_KEY,trimmed);
  };
  const get=()=>{
    init();
    const today=dateKey(parts()),current=read(CURRENT_KEY,null);
    return current&&current.date===today&&current.city?String(current.city):null;
  };
  const getRecord=()=>{
    init();
    const today=dateKey(parts()),current=read(CURRENT_KEY,null);
    return current&&current.date===today&&current.city?{city:String(current.city),special:current.special===true}:null;
  };
  const set=(city,special=false)=>{
    const c=String(city||"").trim();
    if(!c)return null;
    init();
    const today=dateKey(parts());
    write(CURRENT_KEY,{date:today,city:c,special:special===true});
    return c;
  };
  const getHistory=(date)=>{
    init();
    const h=read(HISTORY_KEY,{});
    const x=h&&h[String(date)]||null;
    return x&&x.city?String(x.city):null;
  };
  const isSpecial=()=>{
    const r=getRecord();
    return !!(r&&r.special);
  };
  return {init,get,getRecord,set,getHistory,isSpecial,dateKey};
})();
/* TodayCity: single shared city resolver for Today OPD and Today EEG.
   DailyCity is authoritative when set; otherwise use the schedule-aware city. */
window.TodayCity=window.TodayCity||(()=>{
  const validCity=(city)=>{
    const c=String(city||"").trim();
    const cities=Array.isArray(window.NEURON_CONFIG?.cities)?window.NEURON_CONFIG.cities:[];
    return c&&(!cities.length||cities.includes(c))?c:"";
  };
  const resolve=()=>{
    try { window.DailyCity?.init?.(); } catch (_) {}
    const daily=validCity(window.DailyCity?.get?.());
    if(daily)return daily;
    try {
      const schedule=window.Schedule;
      const cities=Array.isArray(window.NEURON_CONFIG?.cities)?window.NEURON_CONFIG.cities:[];
      if(schedule&&typeof schedule.cityAtNow==="function") {
        return validCity(schedule.cityAtNow(cities));
      }
    } catch (_) {}
    return "";
  };
  return {resolve};
})();
window.$=window.U?.$||((id)=>document.getElementById(id));
if("serviceWorker"in navigator)window.addEventListener("load",()=>{const v=encodeURIComponent(window.NEURON_CONFIG.appVersion);navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!sessionStorage.getItem("neuron-sw-reloaded-"+v)){sessionStorage.setItem("neuron-sw-reloaded-"+v,"1");location.reload();}});navigator.serviceWorker.register("./service-worker.js?v="+v).catch(()=>{});});
const setFooterCurrentSection_=()=>{
 const f=document.getElementById("footer");
 if(!f)return;
 const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
 const map={
  "index.html": [".footer-home-link"],
  "opd_booking.html": [".footer-opd-link"],
  "eeg_booking.html": [".footer-eeg-link"],
  "opd_update.html": [".footer-update-trigger",".footer-opd-update-link"],
  "eeg_update.html": [".footer-update-trigger",".footer-eeg-update-link"],
  "refund.html": [".footer-refund-link"],
  "statistics.html": [".footer-stats-link"]
 };
 f.querySelectorAll(".footer-nav .is-current").forEach(el=>{el.classList.remove("is-current");el.removeAttribute("aria-current")});
 const selectors=map[page]||[];
 selectors.forEach(selector=>{
  const el=f.querySelector(selector);
  if(el){el.classList.add("is-current");el.setAttribute("aria-current","page");}
 });
};

document.addEventListener("DOMContentLoaded",()=>{
 const p=document.body.dataset.title||"Portal",h=document.getElementById("header"),f=document.getElementById("footer");
 if(h)h.innerHTML=`<header class="site-header"><div class="container header-inner"><a class="brand" href="index.html"><img class="brand-logo" src="assets/neuron_logo.svg" alt="NEURON Hospital Logo"><div><div class="brand-title">NEURON HOSPITAL LATUR</div><div class="brand-sub">Pediatric Neurology & Epilepsy Center</div></div></a><a class="header-home" href="index.html"><img src="assets/icons/home.svg" alt="Home"></a></div></header>`;
 document.title=p+" | NEURON Hospital";
 if(f)f.innerHTML=`<footer class="footer"><div class="container"><nav class="footer-nav" aria-label="Quick navigation">
<a class="footer-home-link" href="index.html"><img class="nav-icon" src="assets/icons/home.svg" alt=""><span>Home</span></a>
<a class="footer-opd-link" href="opd_booking.html"><img class="nav-icon" src="assets/icons/opd-booking.svg" alt=""><span>OPD</span></a>
<a class="footer-eeg-link" href="eeg_booking.html"><img class="nav-icon" src="assets/icons/eeg-booking.svg" alt=""><span>EEG</span></a>
<button type="button" class="footer-update-trigger" aria-haspopup="dialog" aria-expanded="false"><img class="nav-icon" src="assets/icons/opd-update.svg" alt=""><span>Update</span></button>
<a class="footer-refund-link" href="refund.html"><img class="nav-icon" src="assets/icons/refund.svg" alt=""><span>Refund</span></a>
<a class="footer-stats-link" href="statistics.html"><img class="nav-icon" src="assets/icons/statistics.svg" alt=""><span>Stats</span></a>
<a class="footer-desktop-update footer-opd-update-link" href="opd_update.html"><img class="nav-icon" src="assets/icons/opd-update.svg" alt=""><span>OPD Update</span></a>
<a class="footer-desktop-update footer-eeg-update-link" href="eeg_update.html"><img class="nav-icon" src="assets/icons/eeg-update.svg" alt=""><span>EEG Update</span></a>
</nav><div class="footer-update-popup" hidden><div class="footer-update-backdrop" data-close-update></div><div class="footer-update-dialog" role="dialog" aria-modal="true" aria-labelledby="footer-update-title"><button type="button" class="footer-update-close" aria-label="Close Update menu" data-close-update>×</button><div id="footer-update-title" class="footer-update-title">Select Update</div><div class="footer-update-options"><a href="opd_update.html"><img src="assets/icons/opd-update.svg" alt=""><span>Update OPD</span></a><a href="eeg_update.html"><img src="assets/icons/eeg-update.svg" alt=""><span>Update EEG</span></a></div></div></div><div class="footer-contact"><b>NEURON Hospital, Latur</b><br>Near Patil Plaza, Infront of Ashwini Hospital • Ausa Road, Latur • <b><a href="tel:02382242581">02382 242581</a></b><br></div></div></footer>`;
 setFooterCurrentSection_();
 const updateTrigger=f?.querySelector('.footer-update-trigger'),updatePopup=f?.querySelector('.footer-update-popup');
 if(updateTrigger&&updatePopup){
  const closeUpdate=()=>{updatePopup.hidden=true;updateTrigger.setAttribute('aria-expanded','false');};
  const openUpdate=()=>{updatePopup.hidden=false;updateTrigger.setAttribute('aria-expanded','true');updatePopup.querySelector('.footer-update-dialog')?.querySelector('a')?.focus();};
  updateTrigger.addEventListener('click',openUpdate);
  updatePopup.querySelectorAll('[data-close-update]').forEach(el=>el.addEventListener('click',closeUpdate));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!updatePopup.hidden){closeUpdate();updateTrigger.focus();}});
 }
});
/* v206.7: centralized Patient Action eligibility rules.
   These rules are shared by the Patient Action UI and the standalone Refund flow.
   Keep the underlying eligibility semantics identical to the existing section rules. */
window.NeuronPatientActionRules=window.NeuronPatientActionRules||(()=>{
 const hasBookedEEG=p=>!(p?.eegCharges===null||p?.eegCharges===undefined||String(p.eegCharges).trim()==="");
 const refundAvailability=p=>({
  opd:Number(p?.opdTotalPaid||0)>0&&p?.opdRefundProvided!==true,
  eeg:Number(p?.eegTotalPaid||0)>0&&p?.eegRefundProvided!==true
 });
 const availableActions=p=>{
  const out=[{key:"OPD_UPDATE",label:"OPD Update"}];
  if(!hasBookedEEG(p))out.push({key:"BOOK_EEG",label:"Book EEG"});
  else out.push({key:"UPDATE_EEG",label:"Update EEG"});
  const refund=refundAvailability(p);
  if(refund.opd||refund.eeg)out.push({key:"REFUND",label:refund.opd&&refund.eeg?"Refund OPD / EEG":refund.opd?"Refund OPD":"Refund EEG",refundAvailable:refund});
  return out;
 };
 return {hasBookedEEG,refundAvailability,availableActions};
})();
/* v206.6: reusable Patient Action Context helpers */
window.NeuronPatientActionContext=window.NeuronPatientActionContext||(()=>{
 const KEY="neuron_selected_today_patient_v1";
 const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_){return null}};
 const write=(value)=>{try{sessionStorage.setItem(KEY,JSON.stringify(value));return true}catch(_){return false}};
 const clear=()=>{try{sessionStorage.removeItem(KEY)}catch(_) {}};
 const notify=(action)=>{try{window.parent!==window&&window.parent.postMessage({type:"NEURON_PATIENT_ACTION_MUTATION",action},window.location.origin)}catch(_) {}};
 return {KEY,read,write,clear,notify};
})();
if(new URLSearchParams(location.search).get("patientAction")==="1")document.body.classList.add("neuron-embedded");

/* v206.9: global popup navigation + scroll containment. */
(() => {
 const GUARD_STATE="__NEURON_POPUP_GUARD__";
 let guardActive=false, cleaning=false, observer=null, touchState=null;
 const isEffectivelyVisible=el=>{
  if(!el)return false;
  let node=el;
  while(node&&node.nodeType===1){
   if(node.hidden||node.getAttribute?.("aria-hidden")==="true")return false;
   const cs=getComputedStyle(node);
   if(cs.display==="none"||cs.visibility==="hidden")return false;
   if(node===document.documentElement)break;
   node=node.parentElement;
  }
  return el.getClientRects().length>0;
 };
 const activeDialogs=()=>Array.from(document.querySelectorAll('[role="dialog"]')).filter(isEffectivelyVisible);
 const popupOpen=()=>activeDialogs().length>0;
 const embedded=()=>document.body?.classList.contains("neuron-embedded")||window.parent!==window;
 const arm=()=>{
  if(guardActive||!popupOpen())return;
  guardActive=true;
  document.documentElement.classList.add("neuron-popup-guard-active");
  document.body?.classList.add("neuron-popup-guard-active");
  try{if(history.state?.neuronPopupGuard!==GUARD_STATE)history.pushState({...(history.state||{}),neuronPopupGuard:GUARD_STATE},"",location.href);}catch(_){}
 };
 const disarm=()=>{
  if(!guardActive)return;
  guardActive=false;
  document.documentElement.classList.remove("neuron-popup-guard-active");
  document.body?.classList.remove("neuron-popup-guard-active");
  cleaning=true;
  try{if(history.state?.neuronPopupGuard===GUARD_STATE)history.back();else cleaning=false;}catch(_){cleaning=false;}
 };
 const sync=()=>{if(popupOpen())arm();else disarm();};
 const init=()=>{
  if(!document.body)return;
  observer=new MutationObserver(sync);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","aria-hidden","style","class"]});
  if(embedded())document.documentElement.classList.add("neuron-popup-embedded");
  sync();
 };
 const nearestScrollable=target=>{
  let node=target?.nodeType===1?target:target?.parentElement;
  while(node&&node!==document.body&&node!==document.documentElement){
   const cs=getComputedStyle(node);
   if(/(auto|scroll|overlay)/.test(cs.overflowY)&&node.scrollHeight>node.clientHeight)return node;
   node=node.parentElement;
  }
  const root=document.scrollingElement||document.documentElement;
  return root&&root.scrollHeight>root.clientHeight?root:null;
 };
 const atBoundary=(el,dy)=>{
  if(!el)return false;
  const root=document.scrollingElement||document.documentElement;
  if(el===document.body||el===document.documentElement||el===root){
   const top=root.scrollTop,max=root.scrollHeight-root.clientHeight;
   return (dy>0&&top<=0)||(dy<0&&top>=max-1);
  }
  return (dy>0&&el.scrollTop<=0)||(dy<0&&el.scrollTop>=el.scrollHeight-el.clientHeight-1);
 };
 const onTouchStart=e=>{
  if(!popupOpen()&&!embedded())return;
  const t=e.touches?.[0]; if(!t)return;
  touchState={x:t.clientX,y:t.clientY,scrollable:nearestScrollable(e.target)};
 };
 const onTouchMove=e=>{
  if(!touchState)return;
  const t=e.touches?.[0]; if(!t)return;
  const dy=t.clientY-touchState.y;
  if(Math.abs(dy)<2)return;
  const sc=touchState.scrollable||nearestScrollable(e.target);
  if(atBoundary(sc,dy))e.preventDefault();
 };
 const onTouchEnd=()=>{touchState=null;};
 const onWheel=e=>{
  if(!popupOpen()&&!embedded())return;
  const dy=Number(e.deltaY)||0;
  if(!dy)return;
  const sc=nearestScrollable(e.target);
  if(!sc){e.preventDefault();return;}
  const root=document.scrollingElement||document.documentElement;
  if(sc===document.body||sc===document.documentElement||sc===root){
   const top=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);
   if((dy<0&&top<=0)||(dy>0&&top>=max-1))e.preventDefault();
   return;
  }
  const top=sc.scrollTop,max=Math.max(0,sc.scrollHeight-sc.clientHeight);
  if((dy<0&&top<=0)||(dy>0&&top>=max-1))e.preventDefault();
 };
 document.addEventListener("touchstart",onTouchStart,{passive:true,capture:true});
 document.addEventListener("touchmove",onTouchMove,{passive:false,capture:true});
 document.addEventListener("touchend",onTouchEnd,{passive:true,capture:true});
 document.addEventListener("touchcancel",onTouchEnd,{passive:true,capture:true});
 document.addEventListener("wheel",onWheel,{passive:false,capture:true});
 window.addEventListener("popstate",()=>{
  if(cleaning){cleaning=false;return;}
  if(guardActive||popupOpen()){
   guardActive=true;
   document.documentElement.classList.add("neuron-popup-guard-active");
   document.body?.classList.add("neuron-popup-guard-active");
   try{history.pushState({...(history.state||{}),neuronPopupGuard:GUARD_STATE},"",location.href);}catch(_){ }
  }
 });
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();

 const addDone=()=>{
  if(new URLSearchParams(location.search).get("patientAction")!=="1"||window.parent===window)return;
  const c=document.getElementById("confirmation");
  if(!c||c.hidden||!c.textContent.trim()||c.querySelector(".patient-action-done"))return;
  if(!c.querySelector(".success")&&!/successfully|confirmed|details updated/i.test(c.textContent))return;
  const b=document.createElement("button");
  b.type="button"; b.className="cta patient-action-done"; b.textContent="Done";
  b.style.cssText="width:100%;margin-top:16px";
  b.addEventListener("click",()=>{try{window.parent.postMessage({type:"NEURON_PATIENT_ACTION_DONE"},window.location.origin);}catch(_){} });
  c.appendChild(b);
 };
 const initDone=()=>{
  if(new URLSearchParams(location.search).get("patientAction")!=="1"||window.parent===window)return;
  const mo=new MutationObserver(addDone); mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden"]});
  addDone();
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initDone,{once:true});else initDone();
})();
