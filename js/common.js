window.$=window.U?.$||((id)=>document.getElementById(id));
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
document.addEventListener("DOMContentLoaded",()=>{
 const p=document.body.dataset.title||"Portal",h=document.getElementById("header"),f=document.getElementById("footer");
 if(h)h.innerHTML=`<header class="site-header"><div class="container header-inner"><a class="brand" href="index.html"><img class="brand-logo" src="assets/neuron_logo.png" alt="NEURON Hospital Logo"><div><div class="brand-title">NEURON Hospital</div><div class="brand-sub">Latur • Pediatric Neurology & Epilepsy Center</div></div></a><a class="header-home" href="index.html"><img src="assets/icons/home.svg" alt="Home"></a></div></header>`;
 document.title=p+" | NEURON Hospital";
 if(f)f.innerHTML=`<footer class="footer"><div class="container"><div class="footer-nav">
<a href="index.html"><img class="nav-icon" src="assets/icons/home.svg" alt="">Home</a>
<a href="opd_booking.html"><img class="nav-icon" src="assets/icons/opd-booking.svg" alt="">OPD Booking</a>
<a href="eeg_booking.html"><img class="nav-icon" src="assets/icons/eeg-booking.svg" alt="">EEG Booking</a>
<a href="opd_update.html"><img class="nav-icon" src="assets/icons/opd-update.svg" alt="">Update OPD</a>
<a href="eeg_update.html"><img class="nav-icon" src="assets/icons/eeg-update.svg" alt="">Update EEG</a>
<a href="statistics.html"><img class="nav-icon" src="assets/icons/statistics.svg" alt="">Statistics</a>
</div><div class="footer-contact"><b>NEURON Hospital, Latur</b><br>Near Patil Plaza, Ausa Road, Latur</div><div class="version">24-08-2026-16:34:00-HTML78-v8-CODE78-v6</div></div></footer>`;
});