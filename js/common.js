window.$=window.U?.$||((id)=>document.getElementById(id));
if("serviceWorker"in navigator)window.addEventListener("load",()=>{const v=encodeURIComponent(window.NEURON_CONFIG.appVersion);navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!sessionStorage.getItem("neuron-sw-reloaded-"+v)){sessionStorage.setItem("neuron-sw-reloaded-"+v,"1");location.reload();}});navigator.serviceWorker.register("./service-worker.js?v="+v).catch(()=>{});});
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
 const updateTrigger=f?.querySelector('.footer-update-trigger'),updatePopup=f?.querySelector('.footer-update-popup');
 if(updateTrigger&&updatePopup){
  const closeUpdate=()=>{updatePopup.hidden=true;updateTrigger.setAttribute('aria-expanded','false');};
  const openUpdate=()=>{updatePopup.hidden=false;updateTrigger.setAttribute('aria-expanded','true');updatePopup.querySelector('.footer-update-dialog')?.querySelector('a')?.focus();};
  updateTrigger.addEventListener('click',openUpdate);
  updatePopup.querySelectorAll('[data-close-update]').forEach(el=>el.addEventListener('click',closeUpdate));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!updatePopup.hidden){closeUpdate();updateTrigger.focus();}});
 }
});