"use strict";

// Detect browser capabilities once, before initializing the application.
// Optional APIs are reported for feature-specific fallbacks; fetch is required
// for authentication and all authoritative backend operations.
function detectBrowserCapabilities() {
  let localStorageAvailable = false;
  let sessionStorageAvailable = false;
  try {
    const probe = "__neuron_capability_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    localStorageAvailable = true;
  } catch (_) {}
  try {
    const probe = "__neuron_capability_probe__";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    sessionStorageAvailable = true;
  } catch (_) {}

  return Object.freeze({
    fetch: typeof window.fetch === "function",
    promise: typeof window.Promise === "function",
    json: typeof window.JSON === "object" && typeof window.JSON.parse === "function",
    abortController: typeof window.AbortController === "function",
    indexedDB: !!window.indexedDB,
    notifications: typeof window.Notification === "function",
    geolocation: !!(window.navigator && window.navigator.geolocation && typeof window.navigator.geolocation.getCurrentPosition === "function"),
    fileDownload: !!(window.document && window.document.createElement && "download" in window.document.createElement("a")),
    webShare: !!(window.navigator && typeof window.navigator.share === "function"),
    clipboardWrite: !!(window.navigator && window.navigator.clipboard && typeof window.navigator.clipboard.writeText === "function"),
    notificationPermission: typeof window.Notification === "function" ? window.Notification.permission : "unsupported",
    localStorage: localStorageAvailable,
    sessionStorage: sessionStorageAvailable,
    cryptoRandomUUID: !!(window.crypto && typeof window.crypto.randomUUID === "function"),
    cryptoGetRandomValues: !!(window.crypto && typeof window.crypto.getRandomValues === "function")
  });
}

window.NeuronBrowserCapabilities = detectBrowserCapabilities();

// File and share helpers are feature-based and never assume native API support.
function normalizeDownloadFilename(filename) {
  const safeName = String(filename || "neuron-download").replace(/[\\\\/:*?"<>|]+/g, "_").trim();
  return safeName || "neuron-download";
}

function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) {
    showToast("Unable to prepare this download.");
    return false;
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = normalizeDownloadFilename(filename);
  anchor.rel = "noopener";
  if ("download" in anchor) {
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  }
  // Older browsers may open the file instead of downloading it.
  const opened = window.open(objectUrl, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  if (!opened) showToast("Your browser blocked the file window. Allow pop-ups to access the file.");
  return !!opened;
}

async function shareOrCopyContent(data) {
  const shareData = data && typeof data === "object" ? data : { text: String(data || "") };
  if (window.NeuronBrowserCapabilities.webShare && (!navigator.canShare || navigator.canShare(shareData))) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
      // Continue to clipboard/manual fallback for other native-share failures.
    }
  }
  const copyText = [shareData.title, shareData.text, shareData.url].filter(Boolean).join("\\n");
  if (copyText && window.NeuronBrowserCapabilities.clipboardWrite) {
    try {
      await navigator.clipboard.writeText(copyText);
      showToast("Share content copied. You can paste it into your preferred app.");
      return "copied";
    } catch (_) {}
  }
  if (copyText) {
    showToast("Sharing is unavailable here. Copy the content manually to share it.");
    return "manual";
  }
  showToast("No shareable content was provided.");
  return "unavailable";
}

window.NeuronFileActions = Object.freeze({
  downloadBlob,
  shareOrCopyContent,
  normalizeDownloadFilename
});

// Backend endpoint is sourced from NEURON-v2.0.zip app/build.gradle.kts.
const BACKEND_URL = "https://script.google.com/macros/s/AKfycbydDHTK0diS9Vius8V9y5kgjnmwoNPIBc9gjcdtN1GcDJIWY0Ql_JlCXxX8vNh5C34/exec";
const SESSION_KEY = "neuronWebsiteSession_v2";
// Remove the prior persistent credential-bearing session once after this update.
// New sessions are tab-scoped in sessionStorage.
try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
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

function updateNetworkStatus(showRestoredNotice = false) {
  const status = document.getElementById("networkStatus");
  if (!status) return;
  const offline = window.navigator && window.navigator.onLine === false;
  status.hidden = !offline;
  if (offline) {
    status.textContent = "You are offline. Server-dependent actions may not work; locally cached information may remain available.";
    status.setAttribute("data-network-state", "offline");
  } else {
    status.removeAttribute("data-network-state");
    if (showRestoredNotice && activeUser) showToast("Connection restored. You can retry the required server action.");
  }
}

const NOTIFICATION_PREFERENCE_KEY = "neuronWebsiteNotificationsEnabled_v1";
let notificationPermissionRequestInFlight = false;
let locationRequestInFlight = false;

function getNotificationPermission() {
  if (!window.NeuronBrowserCapabilities.notifications) return "unsupported";
  try { return window.Notification.permission; } catch (_) { return "unsupported"; }
}

function readNotificationPreference() {
  try { return localStorage.getItem(NOTIFICATION_PREFERENCE_KEY) === "true"; } catch (_) { return false; }
}

function renderNotificationSettings() {
  const panel = document.getElementById("notificationSettingsPanel");
  const status = document.getElementById("notificationSettingsStatus");
  const button = document.getElementById("notificationPermissionButton");
  if (!panel || !status || !button) return;
  const permission = getNotificationPermission();
  const preference = readNotificationPreference();
  if (permission === "unsupported") {
    status.textContent = "This browser does not support web notifications.";
    button.disabled = true;
    button.hidden = true;
    return;
  }
  button.hidden = false;
  if (permission === "granted" && preference) {
    status.textContent = "Notifications are permitted and the local preference is enabled. Delivery still depends on a supported NEURON notification feature.";
    button.textContent = "Disable notification preference";
    button.disabled = false;
  } else if (permission === "granted") {
    status.textContent = "The browser has granted permission. You can enable the local preference for this browser.";
    button.textContent = "Enable notification preference";
    button.disabled = false;
  } else if (permission === "denied") {
    status.textContent = "Notifications are blocked by this browser or site setting. Change the permission in browser site settings to enable them.";
    button.textContent = "Blocked in browser settings";
    button.disabled = true;
  } else {
    status.textContent = "Notifications are currently not enabled. You can choose whether to request browser permission.";
    button.textContent = "Enable notifications";
    button.disabled = false;
  }
}

async function requestNotificationPermission() {
  const button = document.getElementById("notificationPermissionButton");
  const status = document.getElementById("notificationSettingsStatus");
  if (notificationPermissionRequestInFlight) return;
  if (!window.NeuronBrowserCapabilities.notifications) {
    renderNotificationSettings();
    return;
  }
  const currentPermission = getNotificationPermission();
  if (currentPermission === "granted" && readNotificationPreference()) {
    try { localStorage.removeItem(NOTIFICATION_PREFERENCE_KEY); } catch (_) {
      if (status) status.textContent = "Browser permission remains granted, but this browser could not update the local preference.";
      return;
    }
    renderNotificationSettings();
    showToast("Notification preference disabled for this browser.");
    return;
  }
  if (currentPermission === "granted") {
    try { localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, "true"); } catch (_) {
      if (status) status.textContent = "Browser permission is granted, but this browser could not save the preference.";
      return;
    }
    renderNotificationSettings();
    showToast("Notification preference enabled for this browser.");
    return;
  }
  if (currentPermission === "denied") {
    renderNotificationSettings();
    return;
  }
  if (button) button.disabled = true;
  notificationPermissionRequestInFlight = true;
  try {
    const permission = await window.Notification.requestPermission();
    if (permission === "granted") {
      try { localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, "true"); } catch (_) {}
    } else {
      try { localStorage.removeItem(NOTIFICATION_PREFERENCE_KEY); } catch (_) {}
    }
    renderNotificationSettings();
    if (permission === "granted") showToast("Browser notification permission granted.");
    else if (permission === "denied") showToast("Browser notifications were blocked.");
    else showToast("Notification permission was not granted.");
  } catch (_) {
    if (status) status.textContent = "The browser could not complete the notification permission request.";
    if (button) button.disabled = false;
  } finally {
    notificationPermissionRequestInFlight = false;
  }
}

const LOCATION_CITY_CENTERS = Object.freeze([
  { name: "Latur", latitude: 18.4088, longitude: 76.5604 },
  { name: "Udgir", latitude: 18.3920, longitude: 77.1176 },
  { name: "Nilanga", latitude: 18.1167, longitude: 76.7500 },
  { name: "Ambajogai", latitude: 18.7331, longitude: 76.3862 },
  { name: "Dharashiv", latitude: 18.1860, longitude: 76.0419 },
  { name: "Omerga", latitude: 17.8400, longitude: 76.6200 },
  { name: "Barshi", latitude: 18.2345, longitude: 75.6929 },
  { name: "Beed", latitude: 18.9891, longitude: 75.7601 }
]);
let detectedApproximateCity = null;

function approximateDistanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderLocationSettings(message) {
  const status = document.getElementById("locationSettingsStatus");
  const button = document.getElementById("locationPermissionButton");
  const clearButton = document.getElementById("locationClearButton");
  if (!status || !button || !clearButton) return;
  if (!window.NeuronBrowserCapabilities.geolocation) {
    status.textContent = "Location services are not supported in this browser.";
    button.disabled = true;
    return;
  }
  status.textContent = message || (detectedApproximateCity
    ? "Approximate city detected: " + detectedApproximateCity + "."
    : "Location access has not been requested. Choose the button to check your approximate city.");
  clearButton.disabled = !detectedApproximateCity || locationRequestInFlight;
  button.disabled = locationRequestInFlight;
}

function requestApproximateCity() {
  const status = document.getElementById("locationSettingsStatus");
  const button = document.getElementById("locationPermissionButton");
  if (locationRequestInFlight) return;
  if (!window.NeuronBrowserCapabilities.geolocation) {
    renderLocationSettings();
    return;
  }
  locationRequestInFlight = true;
  if (button) button.disabled = true;
  const clearButton = document.getElementById("locationClearButton");
  if (clearButton) clearButton.disabled = true;
  if (status) status.textContent = "Requesting a one-time location check…";
  try {
  window.navigator.geolocation.getCurrentPosition((position) => {
    locationRequestInFlight = false;
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const closest = LOCATION_CITY_CENTERS.map((city) => ({
      name: city.name,
      distance: approximateDistanceKm(latitude, longitude, city.latitude, city.longitude)
    })).sort((a, b) => a.distance - b.distance)[0];
    detectedApproximateCity = closest && closest.distance <= 45 ? closest.name : null;
    renderLocationSettings(detectedApproximateCity
      ? "Approximate city detected: " + detectedApproximateCity + ". This is an estimate based on nearby NEURON service cities."
      : "Your location is outside the approximate matching range of listed NEURON service cities.");
  }, (error) => {
    locationRequestInFlight = false;
    let message = "Could not determine your approximate city.";
    if (error && error.code === 1) message = "Location permission was denied. You can allow it in browser/site settings.";
    else if (error && error.code === 2) message = "Your location is currently unavailable.";
    else if (error && error.code === 3) message = "The location check timed out. You can try again.";
    renderLocationSettings(message);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  } catch (_) {
    locationRequestInFlight = false;
    renderLocationSettings("The browser could not start a location check. Check site permissions and try again.");
  }
}

function clearApproximateCity() {
  detectedApproximateCity = null;
  renderLocationSettings("Saved approximate city cleared. No coordinates were stored.");
}

const viewCopy = {
  home: ["Dashboard", "Your NEURON workspace, based on your account access."],
  opd: ["OPD Booking", "Create an OPD appointment using the existing NEURON booking contract."],
  today: ["Today's OPD", "Today's OPD workspace will be connected in its implementation phase."],
  eeg: ["EEG Booking", "Select eligible patients from the local OPD cache and submit EEG booking."],
  eegCallsLatur: ["Latur EEG Calls", "Register Latur EEG Call appointments using the existing booking workflow."],
  eegCallsAmbajogai: ["Ambajogai EEG Calls", "Register Ambajogai EEG Call appointments using the Ambajogai-specific booking workflow."],
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

let sidebarReturnFocus = null;

function isMobileSidebarOpen() {
  return window.innerWidth <= 820 && sidebar.classList.contains("open");
}

function closeSidebar(restoreFocus = false) {
  const wasOpen = sidebar.classList.contains("open");
  sidebar.classList.remove("open");
  scrim.classList.remove("visible");
  menuButton.setAttribute("aria-expanded", "false");
  sidebar.setAttribute("aria-hidden", window.innerWidth <= 820 ? "true" : "false");
  if (restoreFocus && wasOpen && sidebarReturnFocus && typeof sidebarReturnFocus.focus === "function") {
    sidebarReturnFocus.focus();
  }
  sidebarReturnFocus = null;
}

function openSidebar() {
  if (window.innerWidth > 820 || sidebar.classList.contains("open")) return;
  sidebarReturnFocus = document.activeElement;
  sidebar.classList.add("open");
  scrim.classList.add("visible");
  menuButton.setAttribute("aria-expanded", "true");
  sidebar.setAttribute("aria-hidden", "false");
  const firstNavItem = sidebar.querySelector(".nav-item:not([hidden])");
  if (firstNavItem) firstNavItem.focus();
}

function setView(view) {
  // Navigation visibility is presentation only. Enforce feature access here as
  // well so hidden EEG Calls routes cannot be opened through another UI path.
  const requestedView = Object.prototype.hasOwnProperty.call(viewCopy, view) ? view : "home";
  if (requestedView !== "home" && !activeUser) {
    showToast("Please sign in to access this section.");
    setAuthView(false);
    return;
  }
  const hasEegCallsAccess = !!(activeUser && (activeUser.admin === true || activeUser.eegcalls === true));
  if ((requestedView === "eegCallsLatur" || requestedView === "eegCallsAmbajogai") && !hasEegCallsAccess) {
    showToast("Your account does not have access to EEG Calls.");
    return;
  }
  const copy = viewCopy[requestedView] || viewCopy.home;
  view = requestedView;
  const notificationSettingsPanel = document.getElementById("notificationSettingsPanel");
  if (notificationSettingsPanel) notificationSettingsPanel.hidden = requestedView !== "settings";
  const locationSettingsPanel = document.getElementById("locationSettingsPanel");
  if (locationSettingsPanel) locationSettingsPanel.hidden = requestedView !== "settings";
  if (requestedView === "settings") {
    renderNotificationSettings();
    renderLocationSettings();
  }
  const dashboardContent = document.getElementById("dashboardContent");
  const opdContent = document.getElementById("opdContent");
  const eegContent = document.getElementById("eegContent");
  const eegCallsLaturContent = document.getElementById("eegCallsLaturContent");
  const eegCallsAmbajogaiContent = document.getElementById("eegCallsAmbajogaiContent");
  if (dashboardContent) dashboardContent.hidden = ["opd", "eeg", "eegCallsLatur", "eegCallsAmbajogai"].includes(view);
  if (opdContent) opdContent.hidden = view !== "opd";
  if (eegContent) eegContent.hidden = view !== "eeg";
  if (eegCallsLaturContent) eegCallsLaturContent.hidden = view !== "eegCallsLatur";
  if (eegCallsAmbajogaiContent) eegCallsAmbajogaiContent.hidden = view !== "eegCallsAmbajogai";
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
  if (view === "eegCallsAmbajogai" && typeof window.initializeAmbajogaiEegCallsFeature === "function") window.initializeAmbajogaiEegCallsFeature();
  if (view === "eegCallsAmbajogai" && typeof window.initializeAmbajogaiEegCallsUpdateFeature === "function") window.initializeAmbajogaiEegCallsUpdateFeature();
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

function readSession() {
  let raw;
  try { raw = sessionStorage.getItem(SESSION_KEY); }
  catch (_) { return null; }
  if (!raw) return null;

  let session;
  try { session = JSON.parse(raw); }
  catch (_) {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    return null;
  }

  const createdAt = Number(session && session.createdAt);
  const canonicalCity = normalizeCity(session && session.city);
  const username = String(session && session.username || "").trim();
  const password = String(session && session.password || "");
  const loginRequestId = String(session && session.loginRequestId || "").trim();
  // The backend's login_() sets the active device session ID to the login
  // request ID. The response does not include sessionId, so the website must
  // retain and reuse that exact ID instead of generating an unrelated one.
  if (!session || typeof session !== "object" || !username || !password ||
      !Number.isFinite(createdAt) || createdAt <= 0 || !canonicalCity ||
      !/^[A-Za-z0-9_-]{8,120}$/.test(loginRequestId)) {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    return null;
  }

  const isAdmin = session.admin === true;
  if (!isAdmin && (Date.now() - createdAt >= SESSION_TTL_MS || createdAt > Date.now() + 5 * 60 * 1000)) {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    return null;
  }

  // Normalize persisted session fields and repair sessions saved by earlier
  // website builds that generated a sessionId different from loginRequestId.
  const normalized = {
    ...session,
    username,
    password,
    city: canonicalCity,
    createdAt,
    sessionId: loginRequestId,
    loginRequestId
  };
  if (normalized.sessionId !== session.sessionId || normalized.city !== session.city || normalized.username !== session.username) {
    if (!saveSession(normalized)) return null;
  }
  return normalized;
}

function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
  const ambajogaiEegCallsNav = document.getElementById("eegCallsAmbajogaiNav");
  const hasEegCallsAccess = session.admin === true || session.eegcalls === true;
  if (eegCallsNav) eegCallsNav.hidden = !hasEegCallsAccess;
  if (ambajogaiEegCallsNav) ambajogaiEegCallsNav.hidden = !hasEegCallsAccess;
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
    // login_() on the backend uses loginRequestId as the device session ID.
    // The current response omits sessionId, so use that authoritative value.
    sessionId: String(data.sessionId || payload.loginRequestId),
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

let loginInProgress = false;
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginInProgress) return;
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
  loginInProgress = true;
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
    loginInProgress = false;
    loginSubmit.disabled = false;
    loginSubmit.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
  }
});

document.getElementById("logoutButton").addEventListener("click", () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
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
const eegCallsAmbajogaiBack = document.getElementById("eegCallsAmbajogaiBackButton");
if (eegCallsAmbajogaiBack) eegCallsAmbajogaiBack.addEventListener("click", () => setView("home"));
menuButton.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", () => closeSidebar(true));
scrim.addEventListener("click", () => closeSidebar(true));
document.getElementById("exploreButton").addEventListener("click", () => {
  document.querySelector(".overview-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Application shell preview. Operational workflows are implemented in later phases.");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isMobileSidebarOpen()) {
    event.preventDefault();
    closeSidebar(true);
    return;
  }
  if (event.key === "Tab" && isMobileSidebarOpen()) {
    const focusable = Array.from(sidebar.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])"))
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      sidebar.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 820) {
    closeSidebar();
    sidebar.setAttribute("aria-hidden", "false");
  } else if (!sidebar.classList.contains("open")) {
    sidebar.setAttribute("aria-hidden", "true");
  }
});
const notificationPermissionButton = document.getElementById("notificationPermissionButton");
if (notificationPermissionButton) notificationPermissionButton.addEventListener("click", requestNotificationPermission);
const locationPermissionButton = document.getElementById("locationPermissionButton");
if (locationPermissionButton) locationPermissionButton.addEventListener("click", requestApproximateCity);
const locationClearButton = document.getElementById("locationClearButton");
if (locationClearButton) locationClearButton.addEventListener("click", clearApproximateCity);
document.addEventListener("change", (event) => {
  if (event.target && event.target.id === "opdVisitingCity" && detectedApproximateCity) {
    const selectedCity = event.target.value;
    if (selectedCity && selectedCity.toLowerCase() !== detectedApproximateCity.toLowerCase()) {
      showToast("Your approximate location is " + detectedApproximateCity + ". You selected " + selectedCity + " as the visiting city.");
    }
  }
});
menuButton.setAttribute("aria-expanded", "false");
sidebar.setAttribute("aria-hidden", window.innerWidth <= 820 ? "true" : "false");
function handlePageVisibilityChange() {
  updateNetworkStatus();
  if (document.visibilityState !== "visible") {
    closeSidebar(false);
    return;
  }
  // Re-check the tab-scoped session after backgrounding; do not replay mutations
  // or issue backend requests just because the page became visible again.
  if (activeUser) {
    const currentSession = readSession();
    if (!currentSession) {
      activeUser = null;
      setAuthView(false);
      showToast("Your session has expired. Please sign in again.");
    }
  }
}

function handlePageShow(event) {
  updateNetworkStatus();
  if (event && event.persisted) handlePageVisibilityChange();
}

function handlePageHide() {
  closeSidebar(false);
}

document.addEventListener("visibilitychange", handlePageVisibilityChange);
window.addEventListener("pageshow", handlePageShow);
window.addEventListener("pagehide", handlePageHide);
window.addEventListener("online", () => updateNetworkStatus(true));
window.addEventListener("offline", () => updateNetworkStatus(false));
updateNetworkStatus();

if (!window.NeuronBrowserCapabilities.fetch || !window.NeuronBrowserCapabilities.promise) {
  loginSubmit.disabled = true;
  authError.textContent = "This browser is not supported. Please use an updated browser to sign in.";
  setAuthView(false);
} else {
  const restored = readSession();
  if (restored) renderUser(restored);
  else setAuthView(false);
}
