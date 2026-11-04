"use strict";

// Backend endpoint is sourced from NEURON-v2.0.zip app/build.gradle.kts.
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbydDHTK0diS9Vius8V9y5kgjnmwoNPIBc9gjcdtN1GcDJIWY0Ql_JlCXxX8vNh5C34/exec";
const SESSION_KEY = "neuronWebsiteSession_v2";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Initialize the versioned IndexedDB data layer. Storage failure is surfaced
// through this readiness promise; login/navigation remain usable without cache.
window.NeuronDataReady = window.NeuronStorage
  ? window.NeuronStorage.open().then(() => true).catch((error) => {
      console.error("NEURON local data store unavailable:", error);
      return false;
    })
  : Promise.resolve(false);

const authScreen = document.getElementById("authScreen");
const appFrame = document.getElementById("appFrame");
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("loginUsername");
const passwordInput = document.getElementById("loginPassword");
const authError = document.getElementById("authError");
const loginSubmit = document.getElementById("loginSubmit");
const sidebar = document.getElementById("sidebar");
const scrim = document.getElementById("sidebarScrim");
const menuButton = document.getElementById("menuButton");
const sidebarClose = document.getElementById("sidebarClose");
const breadcrumbCurrent = document.getElementById("breadcrumbCurrent");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const pageContent = document.getElementById("pageContent");
const toast = document.getElementById("toast");
let toastTimer = null;
let activeUser = null;

const viewCopy = {
  home: ["Dashboard", "Your NEURON workspace, based on your account access."],
  opd: ["OPD Booking", "Create an OPD appointment using the existing NEURON booking contract."],
  today: ["Today's OPD", "Today's OPD workspace will be connected in its implementation phase."],
  eeg: ["EEG Booking", "Select eligible patients from the local OPD cache and submit EEG booking."],
  eegCallsLatur: ["Latur EEG Calls", "Register Latur EEG Call appointments using the existing booking workflow."],
  prebooking: ["PreBooking", "PreBooking workflow will be connected in its implementation phase."],
  followup: ["Follow-up", "Follow-up workspace will be connected in its implementation phase."],
  statistics: ["Statistics & Reports", "Statistics and reporting will be connected in its implementation phase."],
  services: ["Patient Services", "Patient Services will be connected in its implementation phase."],
  settings: ["Settings", "Account and settings workflows will be connected in their implementation phase."]
};

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function setAuthView(signedIn) {
  authScreen.hidden = signedIn;
  appFrame.hidden = !signedIn;
  if (!signedIn) {
    window.setTimeout(() => usernameInput.focus(), 0);
  }
}

function closeSidebar() {
  sidebar.classList.remove("open");
  scrim.classList.remove("visible");
  menuButton.setAttribute("aria-expanded", "false");
}

function openSidebar() {
  sidebar.classList.add("open");
  scrim.classList.add("visible");
  menuButton.setAttribute("aria-expanded", "true");
}

function setView(view) {
  const copy = viewCopy[view] || viewCopy.home;
  const dashboardContent = document.getElementById("dashboardContent");
  const opdContent = document.getElementById("opdContent");
  const eegContent = document.getElementById("eegContent");
  const eegCallsLaturContent = document.getElementById("eegCallsLaturContent");
  if (dashboardContent) dashboardContent.hidden = ["opd", "eeg", "eegCallsLatur"].includes(view);
  if (opdContent) opdContent.hidden = view !== "opd";
  if (eegContent) eegContent.hidden = view !== "eeg";
  if (eegCallsLaturContent) eegCallsLaturContent.hidden = view !== "eegCallsLatur";
  document.querySelectorAll("[data-view]").forEach((el) => {
    if (el.classList.contains("nav-item")) {
      const selected = el.dataset.view === view;
      el.classList.toggle("active", selected);
      if (selected) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    }
  });
  breadcrumbCurrent.textContent = copy[0];
  pageTitle.textContent = copy[0];
  pageSubtitle.textContent = copy[1];
  if (view !== "home" && view !== "opd") showToast(copy[1]);
  if (view === "opd") {
    initializeOpdForm();
    refreshOpdPendingMutations();
  }
  if (view === "eeg" && typeof window.initializeEegBookingFeature === "function") window.initializeEegBookingFeature();
  if (view === "eeg" && typeof window.initializeEegUpdateFeature === "function") window.initializeEegUpdateFeature();
  if (view === "eegCallsLatur" && typeof window.initializeLaturEegCallsFeature === "function") window.initializeLaturEegCallsFeature();
  if (view === "eegCallsLatur" && typeof window.initializeLaturEegCallsUpdateFeature === "function") window.initializeLaturEegCallsUpdateFeature();
  closeSidebar();
  pageContent.focus({ preventScroll: true });
}

function normalizeCity(city) {
  const supported = ["Latur", "Udgir", "Nilanga", "Dharashiv", "Omerga", "Barshi", "Beed", "Ambajogai"];
  return supported.find((item) => item.toLowerCase() === String(city || "").trim().toLowerCase()) || "";
}

function makeOpdBookingRequestId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = new Uint8Array(8);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function makeRequestId() {
  const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return "LR_" + Date.now().toString(36) + "_" + randomPart;
}

function makeSessionId() {
  return window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID().replace(/-/g, "")
    : makeRequestId() + makeRequestId();
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session !== "object" || !session.username || !session.password || !session.createdAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const isAdmin = session.admin === true;
    if (!isAdmin && Date.now() - Number(session.createdAt) >= SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (!normalizeCity(session.city)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    // Phase 2 sessions predate the device-session identifier. Migrate them
    // once so authenticated website requests match LoginSessionStore behavior.
    if (!session.sessionId) {
      session.sessionId = makeSessionId();
      saveSession(session);
    }
    return session;
  } catch (_) {
    return null;
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch (_) {
    return false;
  }
}

function renderUser(session) {
  activeUser = session;
  const displayName = session.username;
  document.getElementById("profileUsername").textContent = displayName;
  const eegCallsNav = document.getElementById("eegCallsLaturNav");
  if (eegCallsNav) eegCallsNav.hidden = !(session.admin === true || session.eegcalls === true);
  document.getElementById("profileRole").textContent = session.admin ? "Administrator" : "Staff account";
  document.getElementById("profileAvatar").textContent = displayName.charAt(0).toUpperCase();
  document.getElementById("sidebarAccountName").textContent = displayName;
  document.getElementById("sidebarAccountCity").textContent = "Assigned city: " + session.city;
  document.getElementById("sessionStatus").textContent = session.admin ? "Administrator session" : "Signed in";
  document.getElementById("profileChip").setAttribute("aria-label", displayName + ", " + session.city);
  setAuthView(true);
  setView("home");
}

async function authenticate(username, password) {
  const payload = {
    action: "login",
    username,
    password,
    loginRequestId: makeRequestId(),
    installationId: getInstallationId(),
    sourceFcmToken: ""
  };
  let response;
  try {
    response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "follow"
    });
  } catch (error) {
    throw new Error("Could not connect to the NEURON backend. Check the connection and try again.");
  }
  if (!response.ok) throw new Error("Backend request failed (HTTP " + response.status + ").");
  let data;
  try { data = await response.json(); }
  catch (_) { throw new Error("The backend returned an unreadable login response."); }

  if (data.loginRequestId !== payload.loginRequestId) throw new Error("Login response did not match this request. Please try again.");
  if (data.status === "accessdenied") throw new Error("Access denied. Check your username and password.");
  if (data.status !== "accessallowed") throw new Error("The backend returned an unrecognized login status.");
  const canonicalUsername = String(data.username || "").trim();
  const canonicalCity = normalizeCity(data.city);
  if (!canonicalUsername || !canonicalCity) throw new Error("The backend login response is missing a valid username or assigned city.");
  return {
    username: canonicalUsername,
    password,
    city: canonicalCity,
    admin: data.admin === true,
    eegcalls: data.eegcalls === true,
    sessionId: String(data.sessionId || makeSessionId()),
    createdAt: Date.now(),
    loginRequestId: payload.loginRequestId
  };
}

// OPD booking uses the same request fields and request-ID shape as the Android source.
const OPD_CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
let opdInitialized = false;
let opdConfig = null;
let opdFollowupManuallyEdited = false;
let opdLastVisitingCity = "";
let opdSubmitting = false;

async function fetchWithTimeout(url, options, timeoutMs = 35000) {
  if (typeof window.AbortController !== "function") return fetch(url, options);
  const controller = new window.AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

function getInstallationId() {
  const key = "neuronWebsiteInstallationId_v1";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = "WEB_" + makeRequestId() + "_" + makeRequestId();
      localStorage.setItem(key, id);
    }
    return id;
  } catch (_) {
    return "WEB_" + makeRequestId() + "_" + makeRequestId();
  }
}

function indiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), iso: value.year + "-" + value.month + "-" + value.day, key: value.year + value.month + value.day };
}

function scheduledToday(city, dateParts = indiaDateParts()) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  const weekday = date.getUTCDay(); // Sunday=0, same convention as Kotlin DayOfWeek adapted below.
  const week = Math.floor((dateParts.day - 1) / 7) + 1;
  switch (city) {
    case "Latur": return [1, 2, 3, 5, 6].includes(weekday) || ((weekday === 4 || weekday === 0) && week === 5);
    case "Nilanga": return weekday === 6 && week === 1;
    case "Udgir": return weekday === 0 && [2, 4].includes(week);
    case "Beed": return weekday === 4 && [2, 4].includes(week);
    case "Ambajogai": return weekday === 0 && [1, 3].includes(week);
    case "Dharashiv": return weekday === 4 && [1, 3].includes(week);
    case "Barshi": return weekday === 4 && [1, 3].includes(week);
    case "Omerga": return weekday === 6 && week >= 2 && week <= 5;
    default: return false;
  }
}

function activeSpecialCity(dateParts = indiaDateParts()) {
  const special = opdConfig && opdConfig.specialAccess;
  if (!special || special.enabled !== true || special.date !== dateParts.iso) return "";
  return normalizeCity(special.city);
}

function allowedAccountCities() {
  if (!activeUser || activeUser.admin || normalizeCity(activeUser.city) === "Latur") return OPD_CITIES.slice();
  const assigned = normalizeCity(activeUser.city);
  const special = activeSpecialCity();
  return [assigned, special].filter((city, index, all) => city && all.indexOf(city) === index);
}

function eligibleOpdCities() {
  const special = activeSpecialCity();
  return OPD_CITIES.filter((city) => scheduledToday(city) || city === special);
}

function isVisitCancelled(city) {
  const dates = opdConfig && opdConfig.doctorVisitCancelled && opdConfig.doctorVisitCancelled[city];
  return Array.isArray(dates) && dates.includes(indiaDateParts().key);
}

function setSelectOptions(select, options, placeholder, selectedValue) {
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = placeholder;
  select.append(blank);
  options.forEach((city) => {
    const option = document.createElement("option");
    option.value = city;
    option.textContent = city;
    select.append(option);
  });
  select.value = selectedValue || "";
}

function cityAtIndiaNow() {
  const dateParts = indiaDateParts();
  const weekday = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)).getUTCDay();
  const week = Math.floor((dateParts.day - 1) / 7) + 1;
  const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const time = Object.fromEntries(timeParts.map((part) => [part.type, part.value]));
  const minute = Number(time.hour) * 60 + Number(time.minute);
  const windows = {
    Latur: ([1, 2, 3, 5].includes(weekday) || ((weekday === 4 || weekday === 0) && week === 5)) ? [0, 1440] : weekday === 6 ? [900, 1440] : null,
    Nilanga: weekday === 6 && week === 1 ? [0, 900] : null,
    Udgir: weekday === 0 && [2, 4].includes(week) ? [0, 1440] : null,
    Beed: weekday === 4 && [2, 4].includes(week) ? [0, 1440] : null,
    Ambajogai: weekday === 0 && [1, 3].includes(week) ? [0, 1440] : null,
    Dharashiv: weekday === 4 && [1, 3].includes(week) ? [0, 900] : null,
    Barshi: weekday === 4 && [1, 3].includes(week) ? [900, 1440] : null,
    Omerga: weekday === 6 && week >= 2 && week <= 5 ? [0, 900] : null
  };
  return OPD_CITIES.find((city) => windows[city] && minute >= windows[city][0] && minute < windows[city][1]) || "";
}

function defaultOpdCity() {
  const eligible = eligibleOpdCities();
  const accountCities = allowedAccountCities();
  const currentScheduledCity = cityAtIndiaNow();
  if (accountCities.includes(currentScheduledCity) && eligible.includes(currentScheduledCity)) return currentScheduledCity;
  const candidate = normalizeCity(activeUser && activeUser.city);
  if (accountCities.includes(candidate) && eligible.includes(candidate)) return candidate;
  return accountCities.find((city) => eligible.includes(city)) || eligible[0] || "";
}

function updateOpdCityChoices(preserveCurrent = true) {
  const citySelect = document.getElementById("opdVisitingCity");
  if (!citySelect) return;
  const current = preserveCurrent ? citySelect.value : "";
  const choices = allowedAccountCities();
  setSelectOptions(citySelect, choices, "Select Visiting City", choices.includes(current) ? current : defaultOpdCity());
  Array.from(citySelect.options).forEach((option) => {
    if (option.value) option.disabled = !eligibleOpdCities().includes(option.value);
  });
  const city = citySelect.value;
  const eligible = eligibleOpdCities();
  const hint = document.getElementById("opdCityHint");
  if (hint) hint.textContent = city && !eligible.includes(city)
    ? "This city is in your account scope but is not scheduled for OPD today."
    : "Only cities scheduled today or the active Special Access city can be booked.";
  updateNextFollowupCity(city, false, opdLastVisitingCity);
  opdLastVisitingCity = city;
}

function updateNextFollowupCity(visitingCity, resetManual, previousCity) {
  const nextSelect = document.getElementById("opdNextFollowupCity");
  if (!nextSelect) return;
  if (resetManual) opdFollowupManuallyEdited = false;
  const isNew = document.getElementById("opdPatientType").value === "New";
  let selected = nextSelect.value;
  if (isNew) {
    if (visitingCity === "Latur") {
      selected = "";
      opdFollowupManuallyEdited = false;
    } else if (previousCity === "Latur") {
      selected = visitingCity;
      opdFollowupManuallyEdited = false;
    } else if (!opdFollowupManuallyEdited) {
      selected = visitingCity;
    }
  } else if (resetManual) {
    selected = "";
  }
  setSelectOptions(nextSelect, OPD_CITIES, "Select Followup City", selected);
  const hint = document.getElementById("opdNextCityHint");
  if (hint) hint.textContent = visitingCity === "Latur" && isNew
    ? "Latur is the main hospital: select the next follow-up city manually. No default is selected."
    : isNew
      ? "For a new patient, the follow-up city defaults to the visiting city. You may change it."
      : "Choose the patient's next follow-up city; historical Follow-up cache selection is not yet part of this phase.";
}

function updatePatientTypeVisibility() {
  const isNew = document.getElementById("opdPatientType").value === "New";
  ["opdVerifyGroup", "opdReferralModeGroup", "opdReferredByGroup"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.hidden = !isNew || (id === "opdReferredByGroup" && document.querySelector('input[name="opdReferralMode"]:checked').value === "self");
  });
  document.getElementById("opdFollowupNote").hidden = isNew;
  if (!isNew) {
    document.getElementById("opdVerifyWhatsapp").value = "";
    document.getElementById("opdReferredBy").value = "";
    opdFollowupManuallyEdited = false;
    setSelectOptions(document.getElementById("opdNextFollowupCity"), OPD_CITIES, "Select Followup City", "");
    document.getElementById("opdNextCityHint").textContent = "Choose the patient's next follow-up city; historical Follow-up cache selection is not yet part of this phase.";
  } else {
    updateNextFollowupCity(document.getElementById("opdVisitingCity").value, true);
  }
}

function resetOpdForm() {
  const form = document.getElementById("opdBookingForm");
  if (!form) return;
  form.reset();
  document.getElementById("opdAppointmentDate").value = indiaDateParts().iso;
  document.getElementById("opdPatientType").value = "New";
  document.getElementById("opdCashPaid").value = "500";
  document.getElementById("opdPaymentMode").value = "Cash";
  document.getElementById("opdOnlinePaid").value = "";
  opdFollowupManuallyEdited = false;
  updateOpdPaymentVisibility();
  updateOpdCityChoices(false);
  updatePatientTypeVisibility();
  document.getElementById("opdFormError").textContent = "";
  document.getElementById("opdResultPanel").hidden = true;
  document.getElementById("opdPendingPanel").hidden = true;
}

function updateOpdPaymentVisibility() {
  const mode = document.getElementById("opdPaymentMode").value;
  document.getElementById("opdCashGroup").hidden = mode === "Online";
  document.getElementById("opdOnlineGroup").hidden = mode === "Cash";
  if (mode === "Cash") document.getElementById("opdOnlinePaid").value = "";
  if (mode === "Online") document.getElementById("opdCashPaid").value = "";
}

async function initializeOpdForm() {
  if (opdInitialized) return;
  const form = document.getElementById("opdBookingForm");
  if (!form) return;
  opdInitialized = true;
  document.getElementById("opdAppointmentDate").value = indiaDateParts().iso;
  setSelectOptions(document.getElementById("opdNextFollowupCity"), OPD_CITIES, "Select Followup City", "");
  updateOpdCityChoices(false);
  updateOpdPaymentVisibility();
  updatePatientTypeVisibility();
  initializeOpdBookingFeature();
  initializeOpdUpdateFeature();
  fetchOpdConfiguration();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  if (!/^[A-Za-z]+$/.test(username)) {
    authError.textContent = "Username must contain letters only.";
    usernameInput.focus();
    return;
  }
  if (!/^[0-9]+$/.test(password)) {
    authError.textContent = "Password must contain numbers only.";
    passwordInput.focus();
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";
  try {
    const session = await authenticate(username, password);
    if (!saveSession(session)) {
      authError.textContent = "Sign-in succeeded, but this browser cannot save the session. Enable site storage and try again.";
      return;
    }
    passwordInput.value = "";
    renderUser(session);
    showToast("Signed in successfully.");
  } catch (error) {
    authError.textContent = error instanceof Error ? error.message : "Sign-in failed. Please try again.";
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
  }
});

document.getElementById("logoutButton").addEventListener("click", () => {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  activeUser = null;
  closeSidebar();
  authError.textContent = "";
  passwordInput.value = "";
  setAuthView(false);
  showToast("You have signed out.");
});

document.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", () => setView(el.dataset.view)));
const eegCallsBack = document.getElementById("eegCallsLaturBackButton");
if (eegCallsBack) eegCallsBack.addEventListener("click", () => setView("home"));
menuButton.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
scrim.addEventListener("click", closeSidebar);
document.getElementById("exploreButton").addEventListener("click", () => {
  document.querySelector(".overview-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Application shell preview. Operational workflows are implemented in later phases.");
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });
window.addEventListener("resize", () => { if (window.innerWidth > 820) closeSidebar(); });
menuButton.setAttribute("aria-expanded", "false");

const restored = readSession();
if (restored) renderUser(restored);
else setAuthView(false);
