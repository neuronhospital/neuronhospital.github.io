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
if (window.NeuronApplicationLifecycle) window.NeuronApplicationLifecycle.initialize();

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
// Authentication session persists across browser restarts, matching Android.
// Migrate a valid existing tab-scoped session once without discarding it.
try {
  if (!localStorage.getItem(SESSION_KEY)) {
    const legacySession = sessionStorage.getItem(SESSION_KEY);
    if (legacySession) localStorage.setItem(SESSION_KEY, legacySession);
  }
  sessionStorage.removeItem(SESSION_KEY);
} catch (_) {}
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Initialize the versioned IndexedDB data layer. Storage failure is surfaced
// through this readiness promise; login/navigation remain usable without cache.
window.NeuronDataReady = window.NeuronStorage
  ? window.NeuronStorage.open().then(() => true).catch((error) => {
      console.error("NEURON local data store unavailable:", error);
      return false;
    })
  : Promise.resolve(false);

// Reconcile interrupted local mutation attempts after IndexedDB is ready. The
// recovery sweep is conservative: stale IN_FLIGHT becomes UNKNOWN; it never
// submits a mutation or invents confirmation evidence.
async function recoverWebsiteMutations() {
  if (!window.NeuronMutations || typeof window.NeuronMutations.recoverInterruptedOperations !== "function") return;
  try {
    await window.NeuronDataReady;
    await window.NeuronMutations.recoverInterruptedOperations();
  } catch (error) {
    console.warn("Unable to recover interrupted mutation records:", error);
  }
}
recoverWebsiteMutations();

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
window.neuronActiveUser = null;

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
const NOTIFICATION_CATEGORY_KEY = "neuronWebsiteNotificationCategories_v1";
const NOTIFICATION_CATEGORIES = Object.freeze(["opd", "eeg", "update", "refund", "prebooking", "eeg_calls", "amb_eeg_calls", "sound_while_in_app"]);
function readNotificationCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_CATEGORY_KEY) || "{}");
    return Object.fromEntries(NOTIFICATION_CATEGORIES.map((key) => [key, parsed[key] === true]));
  } catch (_) { return Object.fromEntries(NOTIFICATION_CATEGORIES.map((key) => [key, false])); }
}
function saveNotificationCategory(key, enabled) {
  if (!NOTIFICATION_CATEGORIES.includes(key)) return false;
  const values = readNotificationCategories();
  values[key] = enabled === true;
  try { localStorage.setItem(NOTIFICATION_CATEGORY_KEY, JSON.stringify(values)); return true; }
  catch (_) { showToast("This browser could not save notification preferences."); return false; }
}
function renderNotificationCategories() {
  const values = readNotificationCategories();
  document.querySelectorAll("[data-notification-preference]").forEach((control) => {
    const key = control.dataset.notificationPreference;
    if (NOTIFICATION_CATEGORIES.includes(key)) control.checked = values[key] === true;
  });
}

// Route destinations for notification taps. This is a navigation contract only;
// browser push delivery is implemented separately and is not implied here.
function openNotificationDestination(eventType) {
  const type = String(eventType || "").trim().toUpperCase();
  const destinations = {
    OPD_BOOKING: "opd", OPD_UPDATE: "today", EEG_BOOKING: "eeg", EEG_UPDATE: "eeg",
    EEG_CALLS_BOOKING: "eegCallsLatur", EEG_CALLS_UPDATE: "eegCallsLatur",
    AMB_EEG_CALLS_BOOKING: "eegCallsAmbajogai", AMB_EEG_CALLS_UPDATE: "eegCallsAmbajogai",
    PREBOOKING_CREATE: "prebooking", REFUND: "statistics"
  };
  const destination = destinations[type];
  if (!destination) { setView("home"); return false; }
  setView(destination);
  // EEG Calls notification destinations are the corresponding city-specific
  // calls workspace, where its records/status controls are displayed.
  return true;
}
window.NeuronNotificationNavigation = Object.freeze({ open: openNotificationDestination });

// Browser notification adapter. It can display events delivered to the active
// page by a supported NEURON integration; it is not a Web Push/FCM receiver.
const BROWSER_NOTIFICATION_CATEGORY_BY_EVENT = Object.freeze({
  OPD_BOOKING: "opd", EEG_BOOKING: "eeg", OPD_UPDATE: "update", EEG_UPDATE: "update",
  REFUND: "refund", PREBOOKING_CREATE: "prebooking",
  EEG_CALLS_BOOKING: "eeg_calls", EEG_CALLS_UPDATE: "eeg_calls",
  AMB_EEG_CALLS_BOOKING: "amb_eeg_calls", AMB_EEG_CALLS_UPDATE: "amb_eeg_calls"
});
function browserNotificationCopy(data) {
  const type = String(data.eventType || "").trim().toUpperCase();
  const patient = String(data.patientName || "Patient name unavailable").trim() || "Patient name unavailable";
  const amountRaw = String(data.amount ?? "").replace(/[₹,]/g, "").trim();
  const amount = amountRaw && Number.isFinite(Number(amountRaw)) ? `₹${Number(amountRaw)}` : "Amount unavailable";
  const changed = String(data.changedField || data.changedFields || "Changed Field").trim();
  switch (type) {
    case "OPD_BOOKING": return { title: "New OPD Booking", body: `${patient} • ${amount}` };
    case "OPD_UPDATE": return { title: "OPD Updated", body: `${patient} • ${changed}` };
    case "EEG_BOOKING": return { title: "New EEG Booking", body: `${patient} • ${amount}` };
    case "EEG_UPDATE": return { title: "EEG Updated", body: `${patient} • ${changed}` };
    case "REFUND": return { title: "Refund Processed", body: `${patient} • ${data.amount ? `Refund ₹${data.amount}` : "Refund amount unavailable"}` };
    case "EEG_CALLS_BOOKING": return { title: "Latur EEG Calls Booking", body: `${patient} • ${amount}` };
    case "EEG_CALLS_UPDATE": return { title: "Latur EEG Calls Updated", body: `${patient} • ${changed}` };
    case "AMB_EEG_CALLS_BOOKING": return { title: "Ambajogai EEG Calls Booking", body: patient };
    case "AMB_EEG_CALLS_UPDATE": return { title: "Ambajogai EEG Calls Updated", body: patient };
    case "PREBOOKING_CREATE": return { title: "New Pre Booking", body: `${patient} • ${String(data.city || "City unavailable")} • ${String(data.date || "Date unavailable")}` };
    default: return { title: "NEURON Update", body: patient };
  }
}
function showBrowserNotification(eventData) {
  const data = eventData && typeof eventData === "object" ? eventData : {};
  const type = String(data.eventType || "").trim().toUpperCase();
  const category = BROWSER_NOTIFICATION_CATEGORY_BY_EVENT[type];
  if (!category) return { shown: false, reason: "unsupported-event" };
  if (!window.NeuronBrowserCapabilities.notifications) return { shown: false, reason: "unsupported-browser" };
  if (getNotificationPermission() !== "granted") return { shown: false, reason: "permission-not-granted" };
  if (!readNotificationPreference()) return { shown: false, reason: "browser-preference-disabled" };
  if (readNotificationCategories()[category] !== true) return { shown: false, reason: "category-disabled" };
  const copy = browserNotificationCopy(data);
  try {
    const notification = new window.Notification(copy.title, {
      body: copy.body,
      tag: String(data.eventId || data.operationId || `${type}-${Date.now()}`),
      silent: document.visibilityState === "visible" && readNotificationCategories().sound_while_in_app !== true,
      data: { eventType: type }
    });
    notification.onclick = () => {
      try { window.focus(); } catch (_) {}
      openNotificationDestination(type);
      notification.close();
    };
    return { shown: true };
  } catch (_) {
    // Some browsers expose Notification but require a service-worker context.
    return { shown: false, reason: "display-unavailable" };
  }
}
window.NeuronBrowserNotifications = Object.freeze({ show: showBrowserNotification, copy: browserNotificationCopy });
window.addEventListener("neuron:notification", (event) => {
  const result = showBrowserNotification(event && event.detail);
  if (!result.shown && result.reason === "unsupported-browser") {
    showToast("This browser does not support system notifications. NEURON remains usable in this tab.");
  }
});

let appConfigurationRefreshInFlight = false;

function renderAppConfigurationPanel() {
  const panel = document.getElementById("appConfigurationPanel");
  const button = document.getElementById("appConfigurationRefreshButton");
  if (!panel || !button) return;
  const isAdmin = !!(activeUser && activeUser.admin === true);
  panel.hidden = !isAdmin;
  button.disabled = !isAdmin || appConfigurationRefreshInFlight;
}

async function refreshAppConfigurationSummary() {
  const status = document.getElementById("appConfigurationStatus");
  const summary = document.getElementById("appConfigurationSummary");
  if (!activeUser || activeUser.admin !== true || appConfigurationRefreshInFlight) return;
  appConfigurationRefreshInFlight = true;
  renderAppConfigurationPanel();
  if (status) status.textContent = "Retrieving and validating configuration…";
  if (summary) summary.hidden = true;
  const requestId = "CFG_" + makeRequestId() + makeRequestId();
  try {
    const request = () => fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify({ action: "getAppConfiguration", requestId, username: activeUser.username,
        password: activeUser.password, installationId: getInstallationId(), sessionId: activeUser.sessionId || "" }),
      cache: "no-store", redirect: "follow"
    });
    const coordinated = window.NeuronSyncCoordinator
      ? await window.NeuronSyncCoordinator.run("configuration:admin-summary", request, { waitForLeaseMs: 10000 })
      : { status: "SUCCESS", result: await request() };
    if (coordinated.status !== "SUCCESS" || !coordinated.result) throw new Error("Configuration refresh is active in another tab. Try again shortly.");
    const response = coordinated.result;
    if (!response.ok) throw new Error("Configuration request failed (HTTP " + response.status + ").");
    const data = await response.json();
    if (data.ok !== true || data.requestId !== requestId || data.action !== "getAppConfiguration" ||
        !data.specialAccess || typeof data.specialAccess !== "object" ||
        !data.Doctor_Visit_Cancelled || typeof data.Doctor_Visit_Cancelled !== "object") {
      throw new Error("The configuration response could not be verified. No summary was updated.");
    }
    const special = data.specialAccess;
    const city = normalizeCity(special.city) || "—";
    const date = String(special.date || "").trim() || "—";
    const cancel = data.Doctor_Visit_Cancelled;
    const cancellationCityCount = Object.keys(cancel).filter((key) => Array.isArray(cancel[key]) ? cancel[key].length > 0 : !!cancel[key]).length;
    const cardCount = Array.isArray(data.notificationCards) ? data.notificationCards.length : (String(data.neuron_notification_card || "").trim() ? 1 : 0);
    document.getElementById("appConfigurationSpecialAccess").textContent = special.enabled === true ? "Enabled · " + city + " · " + date : "Disabled";
    document.getElementById("appConfigurationCancelled").textContent = cancellationCityCount + " city entr" + (cancellationCityCount === 1 ? "y" : "ies") + " with cancellation data";
    document.getElementById("appConfigurationCards").textContent = String(cardCount);
    document.getElementById("appConfigurationUpdatedAt").textContent = new Date().toLocaleString();
    if (summary) summary.hidden = false;
    if (status) status.textContent = "Configuration retrieved and response identity validated.";
  } catch (error) {
    if (status) status.textContent = error && error.message ? error.message : "Unable to retrieve configuration. Retry.";
  } finally {
    appConfigurationRefreshInFlight = false;
    renderAppConfigurationPanel();
  }
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
const LOCATION_CITY_CACHE_KEY = "neuronWebsiteApproximateCity_v1";
const LOCATION_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const LOCATION_MAX_MATCH_DISTANCE_KM = 45;
let detectedApproximateCity = null;
let detectedApproximateCityAt = 0;
let locationPermissionState = "unknown";

function approximateDistanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function restoreApproximateCityCache() {
  try {
    const raw = localStorage.getItem(LOCATION_CITY_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw);
    const validCity = LOCATION_CITY_CENTERS.some((city) => city.name === cached.city);
    const age = Date.now() - Number(cached.checkedAt);
    if (validCity && Number.isFinite(age) && age >= 0 && age <= LOCATION_CACHE_MAX_AGE_MS) {
      detectedApproximateCity = cached.city;
      detectedApproximateCityAt = Number(cached.checkedAt);
    } else {
      localStorage.removeItem(LOCATION_CITY_CACHE_KEY);
    }
  } catch (_) {
    detectedApproximateCity = null;
    detectedApproximateCityAt = 0;
  }
}

function persistApproximateCity(city, checkedAt) {
  try {
    if (city) localStorage.setItem(LOCATION_CITY_CACHE_KEY, JSON.stringify({ city, checkedAt }));
    else localStorage.removeItem(LOCATION_CITY_CACHE_KEY);
  } catch (_) {
    // Location remains available in memory for this page even when storage is blocked.
  }
}

function renderLocationSettings(message) {
  const status = document.getElementById("locationSettingsStatus");
  const button = document.getElementById("locationPermissionButton");
  const clearButton = document.getElementById("locationClearButton");
  if (!status || !button || !clearButton) return;
  if (!window.NeuronBrowserCapabilities.geolocation) {
    status.textContent = "Location services are not supported in this browser.";
    button.disabled = true;
    clearButton.disabled = !detectedApproximateCity;
    return;
  }
  status.textContent = message || (detectedApproximateCity
    ? "Approximate city detected: " + detectedApproximateCity + ". This is a city-level estimate, not an exact address."
    : locationPermissionState === "denied"
      ? "Location permission is blocked. Allow location access in your browser or site settings, then try again."
      : "Location access has not been requested. Choose the button to check your approximate city.");
  clearButton.disabled = !detectedApproximateCity || locationRequestInFlight;
  button.disabled = locationRequestInFlight;
}

function resolveApproximateCity(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  let closest = null;
  for (const city of LOCATION_CITY_CENTERS) {
    const distance = approximateDistanceKm(latitude, longitude, city.latitude, city.longitude);
    if (!closest || distance < closest.distance) closest = { name: city.name, distance };
  }
  return closest && closest.distance <= LOCATION_MAX_MATCH_DISTANCE_KM ? closest.name : null;
}

function applyApproximateCoordinates(latitude, longitude) {
  const city = resolveApproximateCity(latitude, longitude);
  detectedApproximateCity = city;
  detectedApproximateCityAt = city ? Date.now() : 0;
  persistApproximateCity(city, detectedApproximateCityAt);
  return city;
}

function requestApproximateCity(options = {}) {
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
      locationPermissionState = "granted";
      const city = applyApproximateCoordinates(position.coords.latitude, position.coords.longitude);
      renderLocationSettings(city
        ? "Approximate city detected: " + city + ". This is an estimate based on nearby NEURON service-city centers; precise coordinates are not saved."
        : "Your location could not be matched to a supported NEURON service city within " + LOCATION_MAX_MATCH_DISTANCE_KM + " km.");
    }, (error) => {
      locationRequestInFlight = false;
      let message = "Could not determine your approximate city.";
      if (error && error.code === 1) {
        locationPermissionState = "denied";
        message = "Location permission was denied. You can allow it in browser or site settings; location is optional.";
      } else if (error && error.code === 2) {
        locationPermissionState = "unavailable";
        message = "Your location is currently unavailable. Check device location services and try again.";
      } else if (error && error.code === 3) {
        locationPermissionState = "timeout";
        message = "The location check timed out. You can try again.";
      }
      renderLocationSettings(message);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: LOCATION_CACHE_MAX_AGE_MS });
  } catch (_) {
    locationRequestInFlight = false;
    locationPermissionState = "unavailable";
    renderLocationSettings("The browser could not start a location check. Check site permissions and try again.");
  }
}

async function refreshApproximateCityIfAlreadyAllowed() {
  if (!activeUser || !window.NeuronBrowserCapabilities.geolocation || locationRequestInFlight) return;
  // Query permission state without triggering a browser prompt. Prompt only after
  // an explicit user action in Settings; auto-refresh only for prior grants.
  try {
    if (!window.navigator.permissions || typeof window.navigator.permissions.query !== "function") return;
    const permission = await window.navigator.permissions.query({ name: "geolocation" });
    locationPermissionState = permission.state;
    if (permission.state === "granted" && (!detectedApproximateCity || Date.now() - detectedApproximateCityAt > LOCATION_CACHE_MAX_AGE_MS)) {
      requestApproximateCity({ silent: true });
    } else if (permission.state === "denied") {
      renderLocationSettings("Location permission is blocked. Allow it in browser or site settings if you want to use this optional feature.");
    }
  } catch (_) {
    // Permissions API is optional; the explicit Settings action remains available.
  }
}

function clearApproximateCity() {
  detectedApproximateCity = null;
  detectedApproximateCityAt = 0;
  persistApproximateCity(null, 0);
  renderLocationSettings("Approximate city cleared. The website does not retain precise coordinates.");
}

restoreApproximateCityCache();

const viewCopy = {
  home: ["Dashboard", "Your NEURON workspace, based on your account access."],
  opd: ["OPD Booking", "Create an OPD appointment using the existing NEURON booking contract."],
  today: ["Today's OPD", "Review and search the verified current-day OPD snapshot for the selected city."],
  eeg: ["EEG Booking", "Select eligible patients from the local OPD cache and submit EEG booking."],
  eegCallsLatur: ["Latur EEG Calls", "Register Latur EEG Call appointments using the existing booking workflow."],
  eegCallsAmbajogai: ["Ambajogai EEG Calls", "Register Ambajogai EEG Call appointments using the Ambajogai-specific booking workflow."],
  prebooking: ["PreBooking", "Create a pre-appointment request for an eligible city and visiting date."],
  followup: ["Follow-up", "Search, filter, and select existing Follow-up patient records."],
  statistics: ["Statistics & Reports", "Review patient and payment summaries by city and reporting period."],
  services: ["Patient Services", "Select a current-day OPD patient to access patient services and eligible payment actions."],
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

function getRouteView() {
  const candidate = String(window.location.hash || "").replace(/^#\/?/, "").trim();
  return Object.prototype.hasOwnProperty.call(viewCopy, candidate) ? candidate : "home";
}

function syncRoute(view, replace = false) {
  const url = new URL(window.location.href);
  url.hash = "/" + view;
  const state = { ...(window.history.state || {}), neuronView: view };
  if (replace) window.history.replaceState(state, "", url);
  else if (window.location.hash !== url.hash) window.history.pushState(state, "", url);
}

function setView(view, options = {}) {
  // Navigation visibility is presentation only. Enforce feature access here as
  // well so hidden EEG Calls routes cannot be opened through another UI path.
  const requestedView = Object.prototype.hasOwnProperty.call(viewCopy, view) ? view : "home";
  if (requestedView !== "home" && !activeUser) {
    showToast("Please sign in to access this section.");
    setAuthView(false);
    if (options.history === false) syncRoute(view || "home", true);
    return;
  }
  const hasEegCallsAccess = !!(activeUser && (activeUser.admin === true || activeUser.eegcalls === true));
  if ((requestedView === "eegCallsLatur" || requestedView === "eegCallsAmbajogai") && !hasEegCallsAccess) {
    showToast("Your account does not have access to EEG Calls.");
    if (options.history === false) syncRoute(view || "home", true);
    return;
  }
  // Android restricts Today's OPD and Statistics & Reports for non-admin,
  // non-Latur accounts to the day their assigned city is scheduled (or its
  // active Special Access date). Keep the same guard for direct/card navigation.
  if ((requestedView === "today" || requestedView === "statistics") && activeUser &&
      !window.NeuronAccessPolicy.canOpenCityRestrictedSection(activeUser, opdConfig, indiaDateParts())) {
    const assignedCity = normalizeCity(activeUser.city) || "your city";
    showToast("This section will be enabled when the " + assignedCity + " visit is scheduled.");
    if (options.history === false) syncRoute(view || "home", true);
    return;
  }
  if (options.history !== false) syncRoute(requestedView, options.replaceHistory === true);
  const copy = viewCopy[requestedView] || viewCopy.home;
  view = requestedView;
  const notificationSettingsPanel = document.getElementById("notificationSettingsPanel");
  if (notificationSettingsPanel) notificationSettingsPanel.hidden = requestedView !== "settings";
  const appConfigurationPanel = document.getElementById("appConfigurationPanel");
  if (appConfigurationPanel) appConfigurationPanel.hidden = requestedView !== "settings" || !(activeUser && activeUser.admin === true);
  const specialDayModePanel = document.getElementById("specialDayModePanel");
  if (specialDayModePanel) specialDayModePanel.hidden = requestedView !== "settings" || !(activeUser && activeUser.admin === true);
  const cancelledVisitsPanel = document.getElementById("cancelledVisitsPanel");
  if (cancelledVisitsPanel) cancelledVisitsPanel.hidden = requestedView !== "settings" || !(activeUser && activeUser.admin === true);
  const notificationCardManagementPanel = document.getElementById("notificationCardManagementPanel");
  if (notificationCardManagementPanel) notificationCardManagementPanel.hidden = requestedView !== "settings" || !(activeUser && activeUser.admin === true);
  const locationSettingsPanel = document.getElementById("locationSettingsPanel");
  if (locationSettingsPanel) locationSettingsPanel.hidden = requestedView !== "settings";
  if (requestedView === "settings") {
    renderNotificationSettings();
    renderNotificationCategories();
    renderLocationSettings();
    renderAppConfigurationPanel();
    if (window.NeuronSpecialDayMode) window.NeuronSpecialDayMode.initialize();
    if (window.NeuronCancelledVisits) window.NeuronCancelledVisits.initialize();
    if (window.NeuronNotificationCardManagement) window.NeuronNotificationCardManagement.initialize();
  }
  const dashboardContent = document.getElementById("dashboardContent");
  const opdContent = document.getElementById("opdContent");
  const todayContent = document.getElementById("todayContent");
  const eegContent = document.getElementById("eegContent");
  const eegCallsLaturContent = document.getElementById("eegCallsLaturContent");
  const eegCallsAmbajogaiContent = document.getElementById("eegCallsAmbajogaiContent");
  const prebookingContent = document.getElementById("prebookingContent");
  const followupContent = document.getElementById("followupContent");
  const statisticsContent = document.getElementById("statisticsContent");
  const servicesContent = document.getElementById("servicesContent");
  if (dashboardContent) dashboardContent.hidden = ["opd", "today", "eeg", "eegCallsLatur", "eegCallsAmbajogai", "prebooking", "followup", "statistics", "services"].includes(view);
  if (todayContent) todayContent.hidden = view !== "today";
  if (opdContent) opdContent.hidden = view !== "opd";
  if (eegContent) eegContent.hidden = view !== "eeg";
  if (eegCallsLaturContent) eegCallsLaturContent.hidden = view !== "eegCallsLatur";
  if (eegCallsAmbajogaiContent) eegCallsAmbajogaiContent.hidden = view !== "eegCallsAmbajogai";
  if (prebookingContent) prebookingContent.hidden = view !== "prebooking";
  if (followupContent) followupContent.hidden = view !== "followup";
  if (statisticsContent) statisticsContent.hidden = view !== "statistics";
  if (servicesContent) servicesContent.hidden = view !== "services";
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
  if (view === "today" && typeof window.initializeTodayOpdFeature === "function") window.initializeTodayOpdFeature();
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
  if (view === "prebooking" && typeof window.initializePreBookingFeature === "function") window.initializePreBookingFeature();
  if (view === "followup" && typeof window.initializeFollowupFeature === "function") window.initializeFollowupFeature();
  if (view === "statistics" && typeof window.initializeStatisticsFeature === "function") window.initializeStatisticsFeature();
  if (view === "services" && typeof window.initializePatientServicesFeature === "function") window.initializePatientServicesFeature();
  closeSidebar();
  if (window.NeuronAutomaticNotificationCard) window.NeuronAutomaticNotificationCard.render();
  pageContent.focus({ preventScroll: true });
}

function normalizeCity(city) {
  return window.NeuronCore ? window.NeuronCore.normalizeCity(city) : "";
}

function makeOpdBookingRequestId() {
  // Android BookingRequestId.generate() uses SecureRandom.nextInt(26) for each
  // character. Rejection sampling avoids modulo bias while retaining the same
  // eight-uppercase-letter request ID format expected by the backend.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const cryptoApi = window.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    let result = "";
    const bytes = new Uint8Array(16);
    while (result.length < 8) {
      cryptoApi.getRandomValues(bytes);
      for (const byte of bytes) {
        if (byte < 234) result += alphabet[byte % 26];
        if (result.length === 8) break;
      }
    }
    return result;
  }
  // Legacy fallback only where Web Crypto is unavailable.
  let result = "";
  for (let i = 0; i < 8; i += 1) result += alphabet[Math.floor(Math.random() * alphabet.length)];
  return result;
}

function makeRequestId() {
  const randomPart = window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return "LR_" + Date.now().toString(36) + "_" + randomPart;
}

function readSession() {
  let raw;
  try { raw = localStorage.getItem(SESSION_KEY); }
  catch (_) { return null; }
  if (!raw) return null;

  let session;
  try { session = JSON.parse(raw); }
  catch (_) {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
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
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
    return null;
  }

  const isAdmin = session.admin === true;
  if (!isAdmin && (Date.now() - createdAt >= SESSION_TTL_MS || createdAt > Date.now() + 5 * 60 * 1000)) {
    try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
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
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch (_) {
    return false;
  }
}

function renderUser(session) {
  activeUser = session;
  window.neuronActiveUser = session;
  const displayName = session.username;
  document.getElementById("profileUsername").textContent = displayName;
  const eegCallsNav = document.getElementById("eegCallsLaturNav");
  const ambajogaiEegCallsNav = document.getElementById("eegCallsAmbajogaiNav");
  const hasEegCallsAccess = session.admin === true || session.eegcalls === true;
  if (eegCallsNav) eegCallsNav.hidden = !hasEegCallsAccess;
  if (ambajogaiEegCallsNav) ambajogaiEegCallsNav.hidden = !hasEegCallsAccess;
  document.getElementById("profileRole").textContent = session.admin ? "Administrator" : "Staff account";
  renderAppConfigurationPanel();
  document.getElementById("profileAvatar").textContent = displayName.charAt(0).toUpperCase();
  document.getElementById("sidebarAccountName").textContent = displayName;
  document.getElementById("sidebarAccountCity").textContent = "Assigned city: " + session.city;
  document.getElementById("sessionStatus").textContent = session.admin ? "Administrator session" : "Signed in";
  document.getElementById("profileChip").setAttribute("aria-label", displayName + ", " + session.city);
  setAuthView(true);
  setView(getRouteView(), { replaceHistory: true });
  // Restore the last verified configuration immediately and refresh it on app open,
  // when the page returns to foreground, and on the supported hourly cadence.
  if (window.NeuronSyncCoordinator) window.NeuronSyncCoordinator.start();
  if (window.NeuronAppConfigurationRefresh) window.NeuronAppConfigurationRefresh.start();
  else if (typeof fetchOpdConfiguration === "function") fetchOpdConfiguration();
  refreshApproximateCityIfAlreadyAllowed();
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
  return window.NeuronAccessPolicy.allowedAppointmentCities(activeUser, opdConfig, indiaDateParts());
}

function eligibleOpdCities(dateParts = indiaDateParts()) {
  // Android treats Special Day Mode as an additional appointment-eligible city
  // only when the configuration is verified and its configured date is today.
  const special = activeSpecialCity(dateParts);
  return OPD_CITIES.filter((city) => scheduledToday(city, dateParts) || city === special);
}

function isVisitCancelled(city, dateParts = indiaDateParts()) {
  const canonical = normalizeCity(city);
  const cancelledConfig = opdConfig && opdConfig.doctorVisitCancelled;
  if (!canonical || !cancelledConfig || typeof cancelledConfig !== "object") return false;
  const dates = cancelledConfig[canonical];
  return Array.isArray(dates) && dates.some((date) => String(date).trim() === dateParts.key);
}

function opdCityRestrictionLabel(city) {
  const special = activeSpecialCity();
  if (city === special && !scheduledToday(city)) return "Special Access city";
  if (isVisitCancelled(city)) return "Visit cancelled today";
  if (!scheduledToday(city)) return "Not scheduled today";
  return "Scheduled today";
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
  const eligible = eligibleOpdCities();
  Array.from(citySelect.options).forEach((option) => {
    if (!option.value) return;
    const scheduled = eligible.includes(option.value);
    option.disabled = !scheduled;
    option.textContent = option.value + (scheduled ? " · " + opdCityRestrictionLabel(option.value) : " · Not scheduled today");
  });
  const city = citySelect.value;
  const hint = document.getElementById("opdCityHint");
  if (hint) {
    if (!opdConfig) {
      hint.textContent = "Schedule eligibility is applied. Special Access and cancelled-visit settings could not be verified; refresh configuration before relying on those settings.";
    } else if (city && isVisitCancelled(city)) {
      hint.textContent = "Doctor's visit is cancelled today for " + city + ". OPD booking for this city is blocked.";
    } else if (city && !eligible.includes(city)) {
      hint.textContent = "This city is within your account scope but is not scheduled for OPD today.";
    } else if (city === activeSpecialCity() && !scheduledToday(city)) {
      hint.textContent = city + " is enabled for today through Special Day Mode.";
    } else {
      hint.textContent = "Only cities scheduled today or the active Special Access city can be booked.";
    }
  }
  updateNextFollowupCity(city, false, opdLastVisitingCity);
  opdLastVisitingCity = city;
}

function updateNextFollowupCity(visitingCity, resetManual, previousCity) {
  const nextSelect = document.getElementById("opdNextFollowupCity");
  if (!nextSelect) return;
  if (resetManual) opdFollowupManuallyEdited = false;
  const isNew = document.getElementById("opdPatientType").value === "New";
  const currentSelection = nextSelect.value;
  let selected = currentSelection;

  if (isNew) {
    if (visitingCity === "Latur") {
      // Latur requires a receptionist-selected next city. Clear only when entering
      // Latur or explicitly resetting the form/type; keep a valid manual choice
      // during schedule/configuration refreshes while Latur remains selected.
      const enteringLatur = previousCity !== "Latur";
      if (resetManual || enteringLatur || !opdFollowupManuallyEdited) {
        selected = "";
        opdFollowupManuallyEdited = false;
      } else if (!OPD_CITIES.includes(currentSelection)) {
        selected = "";
      }
    } else if (previousCity === "Latur") {
      // Leaving Latur restores the same-city default, including for the active
      // Special Access city; the next city remains editable by the receptionist.
      selected = visitingCity;
      opdFollowupManuallyEdited = false;
    } else if (!opdFollowupManuallyEdited) {
      selected = visitingCity;
    } else if (!OPD_CITIES.includes(currentSelection)) {
      selected = visitingCity;
      opdFollowupManuallyEdited = false;
    }
  } else if (resetManual) {
    // Follow-up bookings use the historical value from the selected patient.
    selected = "";
  }

  if (!OPD_CITIES.includes(selected)) selected = "";
  setSelectOptions(nextSelect, OPD_CITIES, "Select Followup City", selected);
  const hint = document.getElementById("opdNextCityHint");
  if (hint) hint.textContent = visitingCity === "Latur" && isNew
    ? "Latur is the main hospital: select the next follow-up city manually. No default is selected."
    : isNew
      ? (visitingCity === activeSpecialCity() && !scheduledToday(visitingCity)
        ? "This city is enabled through Special Day Mode. Next Follow-up City defaults to the selected city; you may change it."
        : "For a new patient, the follow-up city defaults to the visiting city. You may change it.")
      : "The selected Follow-up patient's historical Next Follow-up City is preselected when available; otherwise choose a city.";
}

function updatePatientTypeVisibility() {
  const isNew = document.getElementById("opdPatientType").value === "New";
  ["opdVerifyGroup", "opdReferralModeGroup", "opdReferredByGroup"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.hidden = !isNew || (id === "opdReferredByGroup" && document.querySelector('input[name="opdReferralMode"]:checked').value === "self");
  });
  document.getElementById("opdFollowupNote").hidden = isNew;
  const followupSearchPanel = document.getElementById("opdFollowupSearchPanel");
  if (followupSearchPanel) followupSearchPanel.hidden = isNew;
  if (!isNew) {
    document.getElementById("opdVerifyWhatsapp").value = "";
    document.getElementById("opdReferredBy").value = "";
    opdFollowupManuallyEdited = false;
    setSelectOptions(document.getElementById("opdNextFollowupCity"), OPD_CITIES, "Select Followup City", "");
    document.getElementById("opdNextCityHint").textContent = "The selected patient's historical next-follow-up city is preselected when available; otherwise choose a city.";
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
  if (typeof clearOpdFollowupSelection === "function") clearOpdFollowupSelection(true);
}

function updateOpdPaymentVisibility() {
  const mode = document.getElementById("opdPaymentMode").value;
  const cashInput = document.getElementById("opdCashPaid");
  const onlineInput = document.getElementById("opdOnlinePaid");
  document.getElementById("opdCashGroup").hidden = mode === "Online";
  document.getElementById("opdOnlineGroup").hidden = mode === "Cash";
  if (mode === "Cash") {
    if (!cashInput.value.trim()) cashInput.value = "500";
    onlineInput.value = "";
  } else if (mode === "Online") {
    if (!onlineInput.value.trim()) onlineInput.value = "500";
    cashInput.value = "";
  } else if (mode === "Split") {
    cashInput.value = "";
    onlineInput.value = "";
  }
  updateOpdSplitTotal();
}

function updateOpdSplitTotal() {
  const mode = document.getElementById("opdPaymentMode")?.value;
  const totalNode = document.getElementById("opdSplitTotal");
  if (!totalNode) return;
  if (mode !== "Split") {
    totalNode.hidden = true;
    return;
  }
  const cash = Number(document.getElementById("opdCashPaid").value || 0);
  const online = Number(document.getElementById("opdOnlinePaid").value || 0);
  const total = cash + online;
  totalNode.hidden = false;
  totalNode.textContent = "Total Amount: ₹" + total;
  totalNode.classList.toggle("is-over-limit", total > 2000);
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
  // Remove the persistent identity first so a concurrent page restore cannot
  // resurrect this account. Keep durable caches and mutation journal intact.
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  activeUser = null;
  window.neuronActiveUser = null;
  if (window.NeuronApplicationLifecycle) window.NeuronApplicationLifecycle.clearLogoutState();
  closeSidebar();
  authError.textContent = "";
  usernameInput.value = "";
  passwordInput.value = "";
  setAuthView(false);
  syncRoute("home", true);
  if (window.NeuronAutomaticNotificationCard) window.NeuronAutomaticNotificationCard.render();
  showToast("You have signed out.");
});

document.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", () => setView(el.dataset.view)));

window.addEventListener("popstate", () => {
  if (!activeUser) {
    syncRoute("home", true);
    return;
  }
  setView(getRouteView(), { history: false });
});
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
const appConfigurationRefreshButton = document.getElementById("appConfigurationRefreshButton");
if (appConfigurationRefreshButton) appConfigurationRefreshButton.addEventListener("click", refreshAppConfigurationSummary);
const notificationPermissionButton = document.getElementById("notificationPermissionButton");
if (notificationPermissionButton) notificationPermissionButton.addEventListener("click", requestNotificationPermission);
document.querySelectorAll("[data-notification-preference]").forEach((control) => {
  control.addEventListener("change", () => {
    const key = control.dataset.notificationPreference;
    if (!saveNotificationCategory(key, control.checked)) control.checked = readNotificationCategories()[key] === true;
    else showToast("Notification preference saved for this browser.");
  });
});
const locationPermissionButton = document.getElementById("locationPermissionButton");
if (locationPermissionButton) locationPermissionButton.addEventListener("click", requestApproximateCity);
const locationClearButton = document.getElementById("locationClearButton");
if (locationClearButton) locationClearButton.addEventListener("click", clearApproximateCity);
const confirmedCityMismatchPairs = new Set();
let cityMismatchDialogPair = null;
let cityMismatchReturnFocus = null;

function closeCityMismatchDialog({ confirmed = false } = {}) {
  const overlay = document.getElementById("cityMismatchOverlay");
  if (!overlay || overlay.hidden) return;
  if (confirmed && cityMismatchDialogPair) confirmedCityMismatchPairs.add(cityMismatchDialogPair);
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  cityMismatchDialogPair = null;
  if (cityMismatchReturnFocus && typeof cityMismatchReturnFocus.focus === "function") {
    cityMismatchReturnFocus.focus({ preventScroll: true });
  }
  cityMismatchReturnFocus = null;
}

function showCityMismatchDialog(selectedCity) {
  const detectedCity = detectedApproximateCity;
  if (!activeUser || !selectedCity || !detectedCity || selectedCity.toLowerCase() === detectedCity.toLowerCase()) return;
  const pair = selectedCity + "|" + detectedCity;
  if (confirmedCityMismatchPairs.has(pair)) return;
  const overlay = document.getElementById("cityMismatchOverlay");
  if (!overlay) return;
  cityMismatchDialogPair = pair;
  cityMismatchReturnFocus = document.activeElement;
  document.getElementById("cityMismatchDetectedCity").textContent = detectedCity;
  document.getElementById("cityMismatchSelectedCity").textContent = selectedCity;
  const scheduledCity = cityAtIndiaNow();
  document.getElementById("cityMismatchScheduleCity").textContent = scheduledCity || "No scheduled city at this time";
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.getElementById("cityMismatchDismiss").focus({ preventScroll: true });
}

document.addEventListener("change", (event) => {
  if (event.target && event.target.id === "opdVisitingCity") showCityMismatchDialog(event.target.value);
});

const cityMismatchDismissButton = document.getElementById("cityMismatchDismiss");
const cityMismatchContinueButton = document.getElementById("cityMismatchContinue");
const cityMismatchOverlay = document.getElementById("cityMismatchOverlay");
if (cityMismatchDismissButton) cityMismatchDismissButton.addEventListener("click", () => closeCityMismatchDialog());
if (cityMismatchContinueButton) cityMismatchContinueButton.addEventListener("click", () => closeCityMismatchDialog({ confirmed: true }));
if (cityMismatchOverlay) {
  cityMismatchOverlay.addEventListener("click", (event) => {
    if (event.target === cityMismatchOverlay) closeCityMismatchDialog();
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cityMismatchOverlay && !cityMismatchOverlay.hidden) closeCityMismatchDialog();
});
document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => closeCityMismatchDialog()));
menuButton.setAttribute("aria-expanded", "false");
sidebar.setAttribute("aria-hidden", window.innerWidth <= 820 ? "true" : "false");
function handlePageVisibilityChange() {
  updateNetworkStatus();
  if (document.visibilityState !== "visible") {
    closeSidebar(false);
    return;
  }
  recoverWebsiteMutations();
  // Re-check the persistent session after backgrounding; do not replay mutations
  // or issue backend requests just because the page became visible again.
  if (activeUser) {
    const currentSession = readSession();
    if (!currentSession) {
      activeUser = null;
      window.neuronActiveUser = null;
      setAuthView(false);
      if (window.NeuronAutomaticNotificationCard) window.NeuronAutomaticNotificationCard.render();
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
window.addEventListener("neuron:mutation-recovery", () => {
  if (typeof refreshOpdPendingMutations === "function" && activeUser && document.visibilityState === "visible") refreshOpdPendingMutations();
});
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
  if (window.NeuronApplicationLifecycle) window.NeuronApplicationLifecycle.restoreAfterBrowserRefresh(!!restored);
  if (restored) renderUser(restored);
  else {
    setAuthView(false);
    syncRoute("home", true);
  }
}
