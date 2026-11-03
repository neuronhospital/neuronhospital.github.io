/* NEURON web authentication. Browser login persists across same-origin pages and tabs; backend credentials remain authoritative. */
(function(){
 "use strict";
 const KEY="neuron_web_auth_v1";
 const CITIES=Array.isArray(window.NEURON_CONFIG?.cities)?window.NEURON_CONFIG.cities:[];
 const read=()=>{try{const raw=localStorage.getItem(KEY);if(!raw)return null;const s=JSON.parse(raw);if(!s||!s.username||!s.password||!s.sessionId)return null;if(!s.installationId){localStorage.removeItem(KEY);return null;}return s;}catch(_){return null;}};
 const write=s=>{try{localStorage.setItem(KEY,JSON.stringify(s));return true;}catch(_){return false;}};
 const clear=()=>{try{localStorage.removeItem(KEY);}catch(_){}};
 const active=()=>{const s=read();if(!s)return null;const age=Date.now()-Number(s.loginAt||0);if(!s.admin&&age>=7*24*60*60*1000){clear();return null;}return s;};
 const newRequestId=()=>"LR_"+Date.now().toString(36)+"_"+Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const newInstallationId=()=>"WEB_"+Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
 const callsPage=page==="eeg_calls_booking.html"||page==="eeg_calls_update_stats.html"||page==="ambajogai_eeg_calls.html";
 const adminPage=page==="admin.html";
 function loginCard(target){
  const box=document.createElement("section");box.className="card neuron-login-card";box.id="neuronLoginCard";
  box.innerHTML='<div class="neuron-login-heading"><span class="neuron-login-lock" aria-hidden="true">🔐</span><div><h2>Login Required</h2><p>Sign in with your NEURON account to continue.</p></div></div><form id="neuronLoginForm" novalidate><div class="neuron-login-fields"><label for="neuronLoginUsername">Username</label><input id="neuronLoginUsername" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" pattern="[A-Za-z]+" required maxlength="64"><label for="neuronLoginPassword">Password</label><div class="neuron-password-wrap"><input id="neuronLoginPassword" name="password" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]+" required maxlength="64"><button id="neuronPasswordToggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div></div><p id="neuronLoginError" class="neuron-login-error" role="alert" aria-live="polite"></p><button id="neuronLoginSubmit" class="cta neuron-login-submit" type="submit">Login</button></form><p class="neuron-login-footnote">Use your assigned account. Access is determined by your account permissions.</p>';
  if(target)target.insertAdjacentElement("beforebegin",box);else document.querySelector("main .container")?.prepend(box);
  return box;
 }
 function showError(msg){const el=document.getElementById("neuronLoginError");if(el)el.textContent=msg||"";}
 function setBusy(b){const btn=document.getElementById("neuronLoginSubmit");if(btn){btn.disabled=b;btn.textContent=b?"Signing in…":"Login";}}
 async function submit(form){
  const username=String(form.elements.username.value||"").trim();
  const password=String(form.elements.password.value||"");
  if(!/^[A-Za-z]+$/.test(username)||!/^[0-9]+$/.test(password)){showError("Incorrect username or password.");return;}
  if(!window.NeuronAPI){showError("Login service is not ready. Reload the page and try again.");return;}
  showError("");setBusy(true);
  try{
   const requestId=newRequestId();
   const response=await window.NeuronAPI.call("login",{username,password,loginRequestId:requestId},15000);
   if(response.loginRequestId!==requestId||!["accessallowed","accessdenied"].includes(response.status))throw Error("The server returned an invalid login response.");
   if(response.status!=="accessallowed"){showError("Incorrect username or password, or account is inactive.");return;}
   const canonical=String(response.username||"").trim(),city=CITIES.find(c=>String(c).toLowerCase()===String(response.city||"").trim().toLowerCase())||"";
   if(!canonical||!city){showError("The account response is incomplete. Contact the administrator.");return;}
   const session={username:canonical,password,sessionId:requestId,installationId:newInstallationId(),admin:response.admin===true,eegcalls:response.eegcalls===true,city,loginAt:Date.now()};
   if(!write(session)){showError("Login succeeded, but this browser could not retain the session. Enable session storage and retry.");return;}
   // Keep browser login on the existing backend contract. The backend has no
   // browser-session registration action; device-session-gated operations may
   // therefore remain unavailable until an approved browser auth mechanism exists.
   location.reload();
  }catch(e){showError(e?.message||"Unable to sign in. Check your connection and try again.");}
  finally{setBusy(false);}
 }
 function applyFooterPermissions(){
  const s=active();
  document.querySelectorAll(".footer-nav a,.footer-nav button").forEach(el=>{
   const home=el.classList.contains("footer-home-link");
   el.hidden=!s&&!home;
  });
 }
 function addLogout(){
  const header=document.querySelector(".site-header .header-inner");if(!header||!active()||document.getElementById("neuronAuthControls"))return;
  const s=active(),wrap=document.createElement("div");wrap.id="neuronAuthControls";wrap.className="neuron-auth-controls";
  const identity=document.createElement("span");identity.className="neuron-auth-identity";identity.textContent=s.username+(s.admin?" · Admin":" · "+s.city);
  const logout=document.createElement("button");logout.type="button";logout.className="neuron-logout-button";logout.textContent="Logout";logout.addEventListener("click",()=>{logout.disabled=true;clear();location.href="index.html";});
  wrap.append(identity,logout);header.append(wrap);
 }
 function applyNav(){
  const s=active();
  document.querySelectorAll(".portal-section-calls,.footer-eeg-calls-link,.footer-amb-eeg-calls-link").forEach(el=>{el.hidden=!(s&&(s.admin||s.eegcalls));});
  document.querySelectorAll(".portal-section-admin").forEach(el=>{el.hidden=!s;});
  document.querySelectorAll(".portal-grid,#portal,#bookingPortal").forEach(el=>{el.hidden=!s;});
  if(adminPage&&s&&!s.admin){document.querySelector("main .container")?.replaceChildren();const msg=document.createElement("section");msg.className="card neuron-access-denied";msg.setAttribute("role","alert");msg.innerHTML="<h2>Admin access required</h2><p>This page is available only to an active Admin account.</p><a class=\"cta\" href=\"index.html\">Return to Home</a>";document.querySelector("main .container")?.append(msg);return;}
  document.querySelectorAll(".portal-admin-tools").forEach(el=>{el.hidden=!(s&&s.admin);});
  const gate=document.getElementById("gate");
  if(gate){if(!s){const card=loginCard(gate);gate.remove();wireForm(card);}else gate.remove();}
  if(page==="index.html"&&!s&&!document.getElementById("neuronLoginCard")){const card=loginCard(document.querySelector(".portal-grid"));wireForm(card);}
  if(callsPage&&s&&!(s.admin||s.eegcalls)){document.querySelector("main .container")?.replaceChildren();const msg=document.createElement("section");msg.className="card neuron-access-denied";msg.setAttribute("role","alert");msg.innerHTML="<h2>Access not enabled</h2><p>EEG Calls access is not enabled for this account.</p><a class=\"cta\" href=\"index.html\">Return to Home</a>";document.querySelector("main .container")?.append(msg);}
 }
 function wireForm(card){
  const form=card?.querySelector("#neuronLoginForm");if(!form||form.dataset.wired)return;form.dataset.wired="1";
  form.addEventListener("submit",e=>{e.preventDefault();submit(form);});
  const toggle=card.querySelector("#neuronPasswordToggle"),input=card.querySelector("#neuronLoginPassword");
  toggle?.addEventListener("click",()=>{const visible=input.type==="password";input.type=visible?"text":"password";toggle.textContent=visible?"Hide":"Show";toggle.setAttribute("aria-label",visible?"Hide password":"Show password");toggle.setAttribute("aria-pressed",String(visible));});
 }
 window.NeuronAuth={get:active,clear,updateCredentials(username,password,admin,city,eegcalls){const s=active();if(!s)return false;s.username=String(username||s.username);s.password=String(password||s.password);s.admin=admin===true;s.city=String(city||s.city);s.eegcalls=eegcalls===true;return write(s);},requireLogin(){return !!active();},getCredentials(){const s=active();return s?{username:s.username,password:s.password,sessionId:s.sessionId,installationId:s.installationId}:null;},isAdmin(){return active()?.admin===true;},canAccessEEGCalls(){const s=active();return !!s&&(s.admin||s.eegcalls);},city(){return active()?.city||"";}};
 document.addEventListener("DOMContentLoaded",applyNav);
 window.addEventListener("load",()=>{applyFooterPermissions();addLogout();},{once:true});
})();
