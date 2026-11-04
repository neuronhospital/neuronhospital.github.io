"use strict";

let opdSelectedFollowupPatient = null;
let opdFollowupSearchBusy = false;

function validateOpdForm() {
  const values = {
    name: document.getElementById("opdPatientName").value.trim(),
    age: document.getElementById("opdAge").value.trim(),
    address: document.getElementById("opdAddress").value.trim(),
    whatsapp: document.getElementById("opdWhatsapp").value.trim(),
    verifyWhatsapp: document.getElementById("opdVerifyWhatsapp").value.trim(),
    referredBy: document.getElementById("opdReferredBy").value.trim(),
    city: document.getElementById("opdVisitingCity").value,
    nextCity: document.getElementById("opdNextFollowupCity").value,
    patientType: document.getElementById("opdPatientType").value,
    mode: document.getElementById("opdPaymentMode").value,
    cash: document.getElementById("opdCashPaid").value.trim(),
    online: document.getElementById("opdOnlinePaid").value.trim()
  };
  const errors = [];
  const fieldErrors = {};
  const addError = (field, message) => { fieldErrors[field] = message; errors.push(message); };
  const alphaCount = (text) => (text.match(/[A-Za-z]/g) || []).length;
  if (alphaCount(values.name) < 3 || !/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(values.name)) addError("name", "Enter a valid patient name using English alphabets, periods, slash, and digits 1, 2, or 3 only.");
  const age = Number(values.age);
  if (!Number.isFinite(age) || age <= 0 || age >= 100) addError("age", "Age must be greater than 0 and less than 100.");
  if (alphaCount(values.address) < 3 || !/^[A-Za-z]+(?:\s*,?\s+[A-Za-z]+)*$/.test(values.address)) addError("address", "Enter a valid address using English alphabets, spaces and comma only.");
  if (!/^[6-9][0-9]{9}$/.test(values.whatsapp)) addError("whatsapp", "Enter a valid 10-digit WhatsApp number.");
  if (values.patientType === "Follow-up" && !opdSelectedFollowupPatient) {
    addError("name", "Search and select the exact existing Follow-up patient record before booking.");
  }
  if (values.patientType === "New") {
    if (!/^[6-9][0-9]{9}$/.test(values.verifyWhatsapp)) addError("verifyWhatsapp", "Enter the WhatsApp number again.");
    else if (values.verifyWhatsapp !== values.whatsapp) addError("verifyWhatsapp", "WhatsApp numbers do not match.");
    const referral = document.querySelector('input[name="opdReferralMode"]:checked');
    const referralMode = referral ? referral.value : "doctor";
    if (referralMode === "doctor" && (alphaCount(values.referredBy) < 3 || !/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(values.referredBy))) addError("referredBy", "Enter a valid Doctor / Hospital name using English alphabets only.");
  }
  if (!OPD_CITIES.includes(values.city)) addError("city", "Select a valid visiting city.");
  if (!OPD_CITIES.includes(values.nextCity)) addError("nextCity", values.city === "Latur" ? "Select the next follow-up city for this Latur booking." : "Select a valid Next Follow-up City.");
  if (!eligibleOpdCities().includes(values.city)) addError("city", "Choose a city scheduled for OPD today or the active Special Access city.");
  if (isVisitCancelled(values.city)) addError("city", "Doctor's visit is cancelled today for " + values.city + ".");
  const cash = values.cash === "" ? null : Number(values.cash);
  const online = values.online === "" ? null : Number(values.online);
  if (values.mode === "Cash") {
    if (!Number.isInteger(cash) || cash < 0 || cash > 2000) addError("cash", "Cash Paid must be between ₹0 and ₹2000.");
  } else if (values.mode === "Online") {
    if (!Number.isInteger(online) || online <= 0 || online > 2000) addError("online", "Online Paid must be greater than ₹0 and up to ₹2000.");
  } else if (values.mode === "Split") {
    if (!Number.isInteger(cash) || cash <= 0 || cash > 2000) addError("cash", "Cash Paid must be greater than ₹0.");
    if (!Number.isInteger(online) || online <= 0 || online > 2000) addError("online", "Online Paid must be greater than ₹0.");
    if (Number.isInteger(cash) && Number.isInteger(online) && cash > 0 && online > 0 && cash + online > 2000) {
      addError("cash", "Total OPD payment cannot exceed ₹2000.");
      addError("online", "Total OPD payment cannot exceed ₹2000.");
    }
  }
  return { values, errors, fieldErrors, cash, online, age };
}

const OPD_FIELD_ERROR_IDS = {
  name: "opdPatientNameError", age: "opdAgeError", address: "opdAddressError",
  whatsapp: "opdWhatsappError", verifyWhatsapp: "opdVerifyWhatsappError",
  referredBy: "opdReferredByError", city: "opdVisitingCityError",
  nextCity: "opdNextFollowupCityError", cash: "opdCashPaidError", online: "opdOnlinePaidError"
};

function clearOpdFieldError(field) {
  const id = OPD_FIELD_ERROR_IDS[field];
  const node = id && document.getElementById(id);
  if (!node) return;
  node.textContent = "";
  node.hidden = true;
  const controlId = ({
    name: "opdPatientName", age: "opdAge", address: "opdAddress", whatsapp: "opdWhatsapp",
    verifyWhatsapp: "opdVerifyWhatsapp", referredBy: "opdReferredBy", city: "opdVisitingCity",
    nextCity: "opdNextFollowupCity", cash: "opdCashPaid", online: "opdOnlinePaid"
  })[field];
  const control = controlId && document.getElementById(controlId);
  if (control) {
    control.setAttribute("aria-invalid", "false");
    control.removeAttribute("aria-describedby");
  }
}

function renderOpdFieldErrors(fieldErrors = {}) {
  Object.entries(OPD_FIELD_ERROR_IDS).forEach(([field, id]) => {
    const node = document.getElementById(id);
    if (!node) return;
    const message = fieldErrors[field] || "";
    node.textContent = message;
    node.hidden = !message;
    const input = ({
      name: "opdPatientName", age: "opdAge", address: "opdAddress", whatsapp: "opdWhatsapp",
      verifyWhatsapp: "opdVerifyWhatsapp", referredBy: "opdReferredBy", city: "opdVisitingCity",
      nextCity: "opdNextFollowupCity", cash: "opdCashPaid", online: "opdOnlinePaid"
    })[field];
    const control = input && document.getElementById(input);
    if (control) {
      control.setAttribute("aria-invalid", message ? "true" : "false");
      if (message) control.setAttribute("aria-describedby", id);
      else control.removeAttribute("aria-describedby");
    }
  });
}

const OPD_CONFIGURATION_CACHE_KEY = "neuronWebsiteAppConfiguration_v1";
const OPD_CONFIGURATION_FRESHNESS_MS = 60 * 60 * 1000;
const OPD_CONFIGURATION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
let opdConfigurationRefreshInFlight = null;
let opdConfigurationRefreshTimer = null;

function isStrictOpdDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day);
}

function isValidOpdConfiguration(value) {
  if (!value || typeof value !== "object" || !value.specialAccess || typeof value.specialAccess !== "object" ||
      !value.doctorVisitCancelled || typeof value.doctorVisitCancelled !== "object") return false;
  const cities = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const special = value.specialAccess;
  if (typeof special.enabled !== "boolean" || typeof special.city !== "string" || typeof special.date !== "string") return false;
  if (special.city && !cities.includes(special.city)) return false;
  const specialDateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(special.date);
  if (!specialDateParts || !isStrictOpdDate(...specialDateParts.slice(1))) return false;
  const cancellations = value.doctorVisitCancelled;
  if (Object.keys(cancellations).length !== cities.length || Object.keys(cancellations).some(city => !cities.includes(city))) return false;
  return cities.every(city => Array.isArray(cancellations[city]) && cancellations[city].every(date =>
    typeof date === "string" && /^\d{8}$/.test(date) && isStrictOpdDate(date.slice(0,4), date.slice(4,6), date.slice(6,8))));
}

function applyOpdConfiguration(configuration) {
  if (!isValidOpdConfiguration(configuration)) return false;
  opdConfig = configuration;
  window.neuronOpdConfig = configuration;
  updateOpdCityChoices(true);
  updateOpdUpdateCityChoices();
  if (typeof window.refreshPreBookingEligibility === "function") window.refreshPreBookingEligibility();
  if (window.NeuronAutomaticNotificationCard) window.NeuronAutomaticNotificationCard.render();
  return true;
}

async function loadCachedOpdConfiguration() {
  // IndexedDB is the canonical durable configuration cache. Keep localStorage as
  // a migration/fallback path for browsers or older website builds.
  try {
    const saved = await window.NeuronStorage?.getConfig("opdAppConfiguration");
    if (saved && Number.isFinite(saved.fetchedAt) && isValidOpdConfiguration(saved.configuration)) return saved;
  } catch (_) {}
  try {
    const raw = localStorage.getItem(OPD_CONFIGURATION_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || !Number.isFinite(saved.fetchedAt) || !isValidOpdConfiguration(saved.configuration)) return null;
    try { await window.NeuronStorage?.setConfig("opdAppConfiguration", saved); } catch (_) {}
    return saved;
  } catch (_) { return null; }
}

async function persistOpdConfiguration(configuration, fetchedAt) {
  const saved = { configuration, fetchedAt };
  try { await window.NeuronStorage?.setConfig("opdAppConfiguration", saved); } catch (_) {}
  // Maintain the previous key for downgrade compatibility. The IndexedDB copy is
  // still authoritative when it can be read.
  try { localStorage.setItem(OPD_CONFIGURATION_CACHE_KEY, JSON.stringify(saved)); }
  catch (_) { /* Configuration remains usable in memory if browser storage is unavailable. */ }
}

/** Refreshes the shared public configuration, retaining the last verified snapshot on failure. */
async function fetchOpdConfiguration(options = {}) {
  const force = options.force === true;
  const silent = options.silent === true;
  if (!activeUser) return { success: false, reason: "not-authenticated" };
  const cached = await loadCachedOpdConfiguration();
  if (cached && !opdConfig) applyOpdConfiguration(cached.configuration);
  if (!force && cached && Date.now() - cached.fetchedAt < OPD_CONFIGURATION_FRESHNESS_MS) {
    return { success: true, fromCache: true, configuration: cached.configuration };
  }
  if (opdConfigurationRefreshInFlight) return opdConfigurationRefreshInFlight;

  const session = activeUser;
  const requestId = "CFG_" + makeRequestId() + makeRequestId();
  const payload = {
    action: "getAppConfiguration", requestId,
    username: session.username, password: session.password,
    installationId: getInstallationId(), sessionId: session.sessionId || ""
  };
  opdConfigurationRefreshInFlight = (async () => {
    try {
      const response = await fetchWithTimeout(BACKEND_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
        body: JSON.stringify(payload), cache: "no-store", redirect: "follow"
      });
      if (!response.ok) throw new Error("Configuration request failed (HTTP " + response.status + ").");
      const data = await response.json();
      // A response started for a previous account/session must not mutate the
      // active page after logout or account replacement.
      if (!activeUser || activeUser.username !== session.username || activeUser.sessionId !== session.sessionId) {
        return { success: false, reason: "session-changed" };
      }
      if (data.ok !== true || data.requestId !== requestId || data.action !== "getAppConfiguration" ||
          !data.specialAccess || typeof data.specialAccess !== "object" ||
          !data.Doctor_Visit_Cancelled || typeof data.Doctor_Visit_Cancelled !== "object") {
        throw new Error("The configuration response could not be verified. The last valid configuration was retained.");
      }
      const configuration = {
        specialAccess: {
          enabled: data.specialAccess.enabled === true,
          city: normalizeCity(data.specialAccess.city) || "",
          date: String(data.specialAccess.date || "").trim()
        },
        doctorVisitCancelled: data.Doctor_Visit_Cancelled
      };
      if (!isValidOpdConfiguration(configuration)) throw new Error("The configuration data is invalid. The last valid configuration was retained.");
      const fetchedAt = Date.now();
      if (!applyOpdConfiguration(configuration)) throw new Error("The configuration could not be applied.");
      await persistOpdConfiguration(configuration, fetchedAt);
      return { success: true, fromCache: false, configuration };
    } catch (error) {
      // Match Android's stale-cache policy: keep the last successfully verified snapshot,
      // do not advance its timestamp, and allow the next eligible refresh to retry.
      const retained = await loadCachedOpdConfiguration();
      if (retained) applyOpdConfiguration(retained.configuration);
      else if (opdConfig && isValidOpdConfiguration(opdConfig)) applyOpdConfiguration(opdConfig);
      else {
        opdConfig = null;
        window.neuronOpdConfig = null;
        updateOpdCityChoices(true);
        updateOpdUpdateCityChoices();
        if (typeof window.refreshPreBookingEligibility === "function") window.refreshPreBookingEligibility();
        if (window.NeuronAutomaticNotificationCard) window.NeuronAutomaticNotificationCard.render();
      }
      if (!silent) showToast("Could not refresh OPD configuration. " + (retained || opdConfig ? "Using the last verified configuration." : "Standard schedule only."));
      return { success: false, fromCache: !!(retained || opdConfig), error: error && error.message ? error.message : "Configuration refresh failed." };
    } finally {
      opdConfigurationRefreshInFlight = null;
    }
  })();
  return opdConfigurationRefreshInFlight;
}

async function startOpdConfigurationRefreshLifecycle() {
  // Restore the most recent validated local snapshot before requesting an update.
  const cached = await loadCachedOpdConfiguration();
  if (cached) applyOpdConfiguration(cached.configuration);
  await fetchOpdConfiguration({ silent: true });
  if (opdConfigurationRefreshTimer === null) {
    opdConfigurationRefreshTimer = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && activeUser) fetchOpdConfiguration({ silent: true });
    }, OPD_CONFIGURATION_REFRESH_INTERVAL_MS);
  }
}

window.NeuronAppConfigurationRefresh = {
  refresh: (force = true) => fetchOpdConfiguration({ force, silent: false }),
  start: startOpdConfigurationRefreshLifecycle
};

window.addEventListener("pageshow", () => {
  if (activeUser) fetchOpdConfiguration({ silent: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && activeUser) fetchOpdConfiguration({ silent: true });
});

function showOpdMutationResult(mutation) {
  const result = document.getElementById("opdResultPanel");
  const pending = document.getElementById("opdPendingPanel");
  const presentation = window.NeuronMutations.presentation(mutation.status);
  pending.hidden = true;
  result.hidden = false;
  result.className = "surface-card opd-result-card status-" + String(mutation.status).toLowerCase();
  result.replaceChildren();
  window.NeuronMutations.renderStatus(result, mutation, { payment: true });
  if (mutation.status === "CONFIRMED") {
    const details = document.createElement("dl");
    [["Appointment ID", mutation.appointmentId], ["Patient", mutation.payload.childName], ["Visiting city", mutation.city], ["Date", mutation.date]].forEach(([label, value]) => {
      const dt = document.createElement("dt"); dt.textContent = label;
      const dd = document.createElement("dd"); dd.textContent = String(value || "—");
      details.append(dt, dd);
    });
    const next = document.createElement("button"); next.type = "button"; next.className = "primary-button"; next.textContent = "New OPD booking"; next.addEventListener("click", resetOpdForm);
    result.append(details, next);
  } else if (["UNKNOWN", "PENDING", "IN_FLIGHT"].includes(mutation.status)) {
    const note = document.createElement("p");
    note.textContent = "Do not submit a new booking for this same appointment. Check the existing request using its request identity.";
    const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button"; check.textContent = "Check existing request status";
    check.addEventListener("click", () => checkOpdMutationStatus(mutation.requestId));
    const controls = [note, check];
    if (["PENDING", "UNKNOWN"].includes(mutation.status)) {
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button";
      retry.textContent = mutation.status === "PENDING" ? "Resume same request ID" : "Retry same request ID";
      retry.addEventListener("click", () => retryOpdMutation(mutation.requestId));
      controls.push(retry);
    }
    const id = document.createElement("small"); id.textContent = "Request ID: " + mutation.requestId;
    controls.push(id); result.append(...controls);
  } else if (mutation.status === "FAILED") {
    const note = document.createElement("p"); note.textContent = mutation.errorMessage || "The backend returned a definitive failure.";
    result.append(note);
  }
}

async function checkOpdMutationStatus(requestId) {
  const mutation = await window.NeuronMutations.get(requestId);
  if (!mutation) { showToast("No saved request was found."); return; }
  const checkButton = document.querySelector("#opdResultPanel button");
  if (checkButton) { checkButton.disabled = true; checkButton.textContent = "Checking…"; }
  try {
    const payload = {
      action: "checkMutationStatus", eventType: "OPD_BOOKING", mutationId: mutation.mutationId,
      bookingRequestId: mutation.requestId, appointmentId: mutation.appointmentId || "", city: mutation.city, recovery: true,
      username: activeUser.username, password: activeUser.password, installationId: getInstallationId(), sessionId: activeUser.sessionId || "", sourceFcmToken: ""
    };
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify(payload), cache: "no-store", redirect: "follow"
    });
    const data = await response.json();
    const queuedMatch = data.found === true && data.source === "FCM_EVENT" && data.eventType === "OPD_BOOKING" && data.mutationId === mutation.mutationId && data.bookingRequestId === mutation.requestId && !!data.appointmentId;
    if (queuedMatch) {
      await window.NeuronMutations.markUnknown(requestId, "A matching FCM event is queued, but the FCM handler has not confirmed completion yet. Keep this request identity and wait for confirmation.");
      showToast("Matching event found; awaiting FCM confirmation.");
    } else {
      await window.NeuronMutations.markUnknown(requestId, "No conclusive confirmation was returned by the status check. Keep this request identity.");
      showToast("The booking result remains unverified. Do not create a new request identity.");
    }
    const updated = await window.NeuronMutations.get(requestId);
    showOpdMutationResult(updated || mutation);
  } catch (_) {
    const updated = await window.NeuronMutations.markUnknown(requestId, "The status check did not return a verifiable result.");
    showOpdMutationResult(updated || mutation);
  }
}

async function submitOpdBooking(event) {
  event.preventDefault();
  if (opdSubmitting) return;
  // Claim the local submit lock synchronously, before the first await, so two
  // rapid submit events cannot both pass the unresolved-request check.
  opdSubmitting = true;
  const submitButton = document.getElementById("opdSubmitButton");
  const restoreSubmitButton = () => {
    opdSubmitting = false;
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit OPD booking <span aria-hidden="true">→</span>';
  };
  submitButton.disabled = true;
  submitButton.textContent = "Validating booking…";
  const validated = validateOpdForm();
  const errorElement = document.getElementById("opdFormError");
  if (validated.errors.length) {
    renderOpdFieldErrors(validated.fieldErrors);
    errorElement.textContent = validated.errors[0];
    const firstInvalid = Object.keys(validated.fieldErrors)[0];
    const firstControlId = ({ name: "opdPatientName", age: "opdAge", address: "opdAddress", whatsapp: "opdWhatsapp", verifyWhatsapp: "opdVerifyWhatsapp", referredBy: "opdReferredBy", city: "opdVisitingCity", nextCity: "opdNextFollowupCity", cash: "opdCashPaid", online: "opdOnlinePaid" })[firstInvalid];
    if (validated.values.patientType === "Follow-up" && !opdSelectedFollowupPatient) document.getElementById("opdFollowupSearch")?.focus();
    else if (firstControlId) document.getElementById(firstControlId)?.focus();
    showToast("Please correct the OPD booking form.");
    restoreSubmitButton();
    return;
  }
  const { values, cash, online, age } = validated;
  renderOpdFieldErrors({});
  const date = indiaDateParts();
  // Guard against a second local submission for the same patient while an earlier
  // request's result is unresolved. Backend request-ID idempotency remains authoritative.
  try {
    await window.NeuronDataReady;
    const normalizedName = (text) => String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
    const normalizedPhone = (text) => String(text || "").replace(/\D/g, "");
    const duplicate = (await window.NeuronMutations.list()).find((item) =>
      item.eventType === "OPD_BOOKING" && item.status !== "FAILED" &&
      item.city === values.city && item.date === date.key && item.payload &&
      normalizedPhone(item.payload.whatsapp) === normalizedPhone(values.whatsapp) &&
      normalizedName(item.payload.childName) === normalizedName(values.name)
    );
    if (duplicate) {
      showOpdMutationResult(duplicate);
      errorElement.textContent = duplicate.status === "CONFIRMED"
        ? "A matching OPD booking is already confirmed for this patient, city, and date."
        : "A matching OPD request already exists. Check its status before submitting again.";
      restoreSubmitButton();
      return;
    }
  } catch (_) {
    errorElement.textContent = "Local request storage is unavailable. The booking was not submitted.";
    restoreSubmitButton();
    return;
  }
  if (document.getElementById("opdAppointmentDate").value !== date.iso) {
    errorElement.textContent = "OPD booking is available only for today's date. No request was sent.";
    restoreSubmitButton();
    return;
  }
  const total = values.mode === "Cash" ? cash : values.mode === "Online" ? online : cash + online;
  const paymentSummary = values.mode === "Split" ? `Cash ${window.NeuronMutations.money(cash)} + Online ${window.NeuronMutations.money(online)} = ${window.NeuronMutations.money(total)}` : `${values.mode}: ${window.NeuronMutations.money(total)}`;
  const accepted = await window.NeuronMutations.confirmOperation({ title: "Confirm OPD booking", message: `Create an OPD appointment for ${values.name} in ${values.city}?`, detail: `Visiting date: ${date.key}\nNext follow-up city: ${values.nextCity}\n${paymentSummary}`, acceptLabel: "Confirm booking" });
  if (!accepted) { restoreSubmitButton(); return; }
  const requestId = makeOpdBookingRequestId();
  const mutationId = window.NeuronMutations.newMutationId ? window.NeuronMutations.newMutationId() : makeRequestId() + "-" + makeRequestId();
  const referralMode = document.querySelector('input[name="opdReferralMode"]:checked').value;
  const referredBy = values.patientType === "New" ? (referralMode === "self" ? "Self" : values.referredBy) : "";
  const payload = {
    action: "bookAppointment", mutationId, bookingRequestId: requestId,
    childName: values.name.replace(/\s+/g, " "), age, ageUnit: document.getElementById("opdAgeUnit").value,
    address: values.address.replace(/\s+/g, " "), referredBy, whatsapp: values.whatsapp,
    city: values.city, appointmentDate: date.key, nextFollowupCity: values.nextCity,
    patientType: values.patientType, opdCharges: total, opdPaymentMode: values.mode,
    opdCashPaid: values.mode === "Online" ? null : cash,
    opdOnlinePaid: values.mode === "Cash" ? null : online,
    username: activeUser.username, password: activeUser.password,
    installationId: getInstallationId(), sourceInstallationId: getInstallationId(),
    sessionId: activeUser.sessionId || "", sourceFcmToken: ""
  };
  submitButton.textContent = "Submitting booking…";
  errorElement.textContent = "";
  document.getElementById("opdResultPanel").hidden = true;
  try {
    await window.NeuronDataReady;
    const created = await window.NeuronMutations.create({
      requestId, mutationId, eventType: "OPD_BOOKING", scope: "opdToday", city: values.city,
      date: date.key, payload
    });
    const envelope = await window.NeuronMutations.retryEnvelope(requestId);
    let response = null;
    let transport = { ok: false };
    try {
      const http = await fetchWithTimeout(BACKEND_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
        body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow"
      });
      let body = null;
      try { body = await http.json(); } catch (_) {}
      response = http;
      transport = { ok: http.ok };
      const classified = await window.NeuronMutations.classifyTransportResult(requestId, transport, body);
      const current = await window.NeuronMutations.get(requestId);
      showOpdMutationResult(current);
      if (classified.state === "CONFIRMED") {
        showToast("OPD appointment confirmed by backend response.");
        if (typeof notifyTodayOpdMutationConfirmed === "function") notifyTodayOpdMutationConfirmed({
          eventType: "OPD_BOOKING", city: values.city, date: date.key,
          bookingRequestId: requestId, appointmentId: current?.appointmentId || ""
        });
      } else showToast("Booking request sent; result needs verification.");
    } catch (networkError) {
      const unknown = await window.NeuronMutations.markUnknown(requestId, "The network response was not received. The backend may have committed the booking; do not create a new request.");
      showOpdMutationResult(unknown || created.mutation);
      showToast("Network result is uncertain. Use Check existing request status.");
    }
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "Unable to save the booking request locally.";
    // If the mutation was already persisted, retain its identity for recovery.
    const existing = await window.NeuronMutations.get(requestId).catch(() => null);
    if (existing) showOpdMutationResult(existing);
  } finally {
    restoreSubmitButton();
    refreshOpdPendingMutations();
  }
}

async function retryOpdMutation(requestId) {
  const current = await window.NeuronMutations.get(requestId);
  if (!current || !["PENDING", "UNKNOWN"].includes(current.status)) return;
  try {
    const envelope = await window.NeuronMutations.retryEnvelope(requestId);
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow"
    });
    let body = null; try { body = await response.json(); } catch (_) {}
    const classified = await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
    if (classified?.state === "CONFIRMED") notifyTodayOpdMutationConfirmed({ eventType: "OPD_BOOKING",
      city: current.city, date: current.date, bookingRequestId: current.requestId,
      appointmentId: classified.mutation?.appointmentId || current.appointmentId || "" });
  } catch (_) {
    await window.NeuronMutations.markUnknown(requestId, "The retry result is still uncertain. The same request identity has been retained.");
  }
  showOpdMutationResult(await window.NeuronMutations.get(requestId) || current);
  refreshOpdPendingMutations();
}

async function refreshOpdPendingMutations() {
  if (!window.NeuronStorage || !window.NeuronMutations) return;
  try {
    await window.NeuronDataReady;
    let all = await window.NeuronMutations.list();
    // A tab may have closed after the attempt began. Convert only stale in-flight
    // attempts to UNKNOWN so they can be checked or resumed with the same IDs.
    for (const item of all) {
      if (item.eventType === "OPD_BOOKING" && item.status === "IN_FLIGHT") {
        await window.NeuronMutations.recoverStaleInFlight(item.requestId);
      }
    }
    all = await window.NeuronMutations.list();
    const unresolved = all.filter((item) => item.eventType === "OPD_BOOKING" && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status));
    const panel = document.getElementById("opdPendingPanel");
    if (!panel) return;
    panel.hidden = unresolved.length === 0;
    panel.replaceChildren();
    if (unresolved.length) {
      const heading = document.createElement("h3"); heading.textContent = "Unresolved OPD requests"; panel.append(heading);
      unresolved.slice(0, 5).forEach((item) => {
        const row = document.createElement("div"); row.className = "opd-pending-row";
        const text = document.createElement("span"); text.textContent = (item.payload && item.payload.childName || "Patient") + " · " + item.status + " · " + item.requestId;
        const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button";
        button.textContent = item.status === "PENDING" ? "Resume same request" : "Check status";
        button.addEventListener("click", () => item.status === "PENDING" ? retryOpdMutation(item.requestId) : checkOpdMutationStatus(item.requestId));
        row.append(text, button);
        if (item.status === "UNKNOWN") {
          const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry same ID";
          retry.addEventListener("click", () => retryOpdMutation(item.requestId));
          row.append(retry);
        }
        panel.append(row);
      });
    }
  } catch (_) {}
}

function setOpdFollowupFieldsLocked(locked) {
  ["opdPatientName", "opdAge", "opdAddress", "opdWhatsapp"].forEach((id) => {
    const control = document.getElementById(id);
    if (control) control.readOnly = !!locked;
  });
  const ageUnit = document.getElementById("opdAgeUnit");
  if (ageUnit) ageUnit.disabled = !!locked;
}

function clearOpdFollowupSelection(clearFields = true) {
  opdSelectedFollowupPatient = null;
  setOpdFollowupFieldsLocked(false);
  const changeButton = document.getElementById("opdFollowupChangePatient");
  if (changeButton) changeButton.hidden = true;
  const results = document.getElementById("opdFollowupResults");
  if (results) results.replaceChildren();
  const search = document.getElementById("opdFollowupSearch");
  if (search) search.disabled = false;
  const searchButton = document.getElementById("opdFollowupSearchButton");
  if (searchButton) searchButton.disabled = false;
  const message = document.getElementById("opdFollowupSearchMessage");
  if (message) message.textContent = "Search is limited to existing Follow-up records for the selected visiting city.";
  if (clearFields) {
    ["opdPatientName", "opdAge", "opdAddress", "opdWhatsapp"].forEach((id) => {
      const control = document.getElementById(id);
      if (control) control.value = "";
    });
    document.getElementById("opdAgeUnit").value = "years";
    setSelectOptions(document.getElementById("opdNextFollowupCity"), OPD_CITIES, "Select Followup City", "");
    opdFollowupManuallyEdited = false;
  }
}

function currentFollowupAge(patient) {
  const age = Number(patient.age);
  const unit = String(patient.ageUnit || "years").toLowerCase();
  const raw = String(patient.date || "").replace(/\D/g, "");
  if (!Number.isFinite(age) || age < 0 || raw.length !== 8) return { age: String(patient.age == null ? "" : patient.age), unit: patient.ageUnit || "years" };
  const year = Number(raw.slice(0, 4)), month = Number(raw.slice(4, 6)), day = Number(raw.slice(6, 8));
  const registered = new Date(Date.UTC(year, month - 1, day));
  if (registered.getUTCFullYear() !== year || registered.getUTCMonth() !== month - 1 || registered.getUTCDate() !== day) return { age: String(patient.age), unit: patient.ageUnit || "years" };
  let birth = new Date(registered.getTime());
  if (unit.startsWith("day")) birth.setUTCDate(birth.getUTCDate() - Math.round(age));
  else if (unit.startsWith("month")) {
    const whole = Math.floor(age); birth.setUTCMonth(birth.getUTCMonth() - whole);
    birth.setUTCDate(birth.getUTCDate() - Math.round((age - whole) * 30));
  } else {
    const whole = Math.floor(age); birth.setUTCFullYear(birth.getUTCFullYear() - whole);
    birth.setUTCMonth(birth.getUTCMonth() - Math.round((age - whole) * 12));
  }
  const nowParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const nowObj = Object.fromEntries(nowParts.map((part) => [part.type, part.value]));
  const now = new Date(Date.UTC(Number(nowObj.year), Number(nowObj.month) - 1, Number(nowObj.day)));
  let months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();
  if (now.getUTCDate() < birth.getUTCDate()) months--;
  months = Math.max(0, months);
  if (months >= 12) {
    const years = Math.round((months / 12) * 2) / 2;
    return { age: String(Number.isInteger(years) ? years : years), unit: "years" };
  }
  if (months >= 1) return { age: String(months), unit: "months" };
  return { age: String(Math.max(0, Math.floor((now - birth) / 86400000))), unit: "days" };
}

function selectOpdFollowupPatient(patient) {
  if (!patient || !String(patient.name || "").trim()) return;
  const age = currentFollowupAge(patient);
  document.getElementById("opdPatientName").value = String(patient.name || "").trim().replace(/\s+/g, " ");
  document.getElementById("opdAge").value = age.age;
  document.getElementById("opdAgeUnit").value = ["years", "months", "days"].includes(age.unit) ? age.unit : "years";
  document.getElementById("opdAddress").value = String(patient.address || "").trim().replace(/\s+/g, " ");
  document.getElementById("opdWhatsapp").value = String(patient.whatsapp || patient.phone || "").replace(/\D/g, "").slice(-10);
  document.getElementById("opdReferredBy").value = "";
  document.getElementById("opdVerifyWhatsapp").value = "";
  const historicalNextCity = window.NeuronCore ? window.NeuronCore.normalizeCity(patient.nextFollowupCity) : String(patient.nextFollowupCity || "");
  setSelectOptions(document.getElementById("opdNextFollowupCity"), OPD_CITIES, "Select Followup City", historicalNextCity);
  opdFollowupManuallyEdited = false;
  opdSelectedFollowupPatient = patient;
  setOpdFollowupFieldsLocked(true);
  document.getElementById("opdFollowupResults").replaceChildren();
  document.getElementById("opdFollowupSearchMessage").textContent = "Selected historical record: " + (patient.date || "date unavailable") + ". Patient details are locked to this selection.";
  document.getElementById("opdFollowupSearch").disabled = true;
  document.getElementById("opdFollowupSearchButton").disabled = true;
  document.getElementById("opdFollowupChangePatient").hidden = false;
  clearOpdFieldError("name");
  ["age", "address", "whatsapp", "nextCity"].forEach(clearOpdFieldError);
}

async function searchOpdFollowupPatients() {
  const queryInput = document.getElementById("opdFollowupSearch");
  const query = String(queryInput.value || "").trim().replace(/\s+/g, " ");
  const city = document.getElementById("opdVisitingCity").value;
  const message = document.getElementById("opdFollowupSearchMessage");
  const results = document.getElementById("opdFollowupResults");
  const button = document.getElementById("opdFollowupSearchButton");
  if (query.length < 2) { message.textContent = "Enter at least 2 characters or a complete WhatsApp number."; queryInput.focus(); return; }
  if (!city) { message.textContent = "Select the visiting city before searching."; return; }
  if (opdFollowupSearchBusy) return;
  opdFollowupSearchBusy = true;
  button.disabled = true;
  results.replaceChildren();
  message.textContent = "Searching existing Follow-up records…";
  try {
    const digits = query.replace(/\D/g, "");
    const isPhone = /^[6-9][0-9]{9}$/.test(digits) && digits.length === query.replace(/\s/g, "").length;
    const payload = { action: isPhone ? "getPatientHistoryByWhatsApp" : "searchFollowupPatients", city, ...(isPhone ? { whatsapp: digits } : { query, queryType: "NAME" }) };
    const result = await window.NeuronCore.request(payload, 25000);
    const data = result && result.body;
    if (!result.response.ok || !data || data.ok !== true) throw new Error(data && data.error ? data.error : "Follow-up search failed.");
    const records = Array.isArray(data.patients) ? data.patients : Array.isArray(data.records) ? data.records : [];
    const unique = records.filter((patient) => patient && String(patient.name || "").trim()).slice(0, 30);
    if (unique.length === 1) { selectOpdFollowupPatient(unique[0]); return; }
    if (!unique.length) { message.textContent = "No matching Follow-up patient found in " + city + ". Check the spelling or WhatsApp number."; return; }
    message.textContent = unique.length + " records found. Select the exact patient and historical visit.";
    unique.forEach((patient) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "opd-followup-result";
      const name = document.createElement("strong"); name.textContent = String(patient.name || "Patient");
      const detail = document.createElement("span");
      detail.textContent = [patient.date || "Date unavailable", patient.age != null ? (patient.age + " " + (patient.ageUnit || "years")) : "Age unavailable", patient.whatsapp || patient.phone || "WhatsApp unavailable", patient.city || city].join(" · ");
      card.append(name, detail);
      card.addEventListener("click", () => selectOpdFollowupPatient(patient));
      results.append(card);
    });
  } catch (error) {
    message.textContent = error && error.message ? error.message : "Unable to search Follow-up records.";
  } finally {
    opdFollowupSearchBusy = false;
    button.disabled = !!opdSelectedFollowupPatient;
  }
}

/** One-way PreBooking patient handoff into the ordinary OPD form.
 * The PB request/appointment identity is intentionally not copied into OPD mutation data.
 */
function prefillOpdFromPreBooking(record) {
  if (!record || !record.prebookingRequestId || !record.appointmentId || !record.patientName) {
    showToast("The selected PreBooking record does not have a verified identity.");
    return;
  }
  const city = window.NeuronCore ? window.NeuronCore.normalizeCity(record.city) : String(record.city || "").trim();
  const citySelect = document.getElementById("opdVisitingCity");
  const cityOption = Array.from(citySelect.options).find((option) => option.value === city);
  if (!cityOption) {
    showToast("This PreBooking city is outside the current OPD account access. No form handoff was made.");
    return;
  }

  clearOpdFollowupSelection(true);
  document.getElementById("opdPatientType").value = "New";
  updatePatientTypeVisibility();
  document.getElementById("opdPatientName").value = String(record.patientName || "").trim();
  const ageRaw = String(record.age || "").trim();
  const ageMatch = ageRaw.match(/^\s*(\d+(?:\.\d+)?)\s*(Days|Months|Years)?\s*$/i);
  document.getElementById("opdAge").value = ageMatch ? ageMatch[1] : ageRaw;
  document.getElementById("opdAgeUnit").value = ageMatch && ageMatch[2] ? ageMatch[2].toLowerCase() : "years";
  document.getElementById("opdAddress").value = String(record.address || "").trim();
  document.getElementById("opdWhatsapp").value = String(record.mobileNumber || "").replace(/\D/g, "").slice(-10);
  document.getElementById("opdVerifyWhatsapp").value = "";
  document.getElementById("opdReferredBy").value = "";
  const selfReferral = document.querySelector('input[name="opdReferralMode"][value="self"]');
  if (selfReferral) selfReferral.checked = true;
  updatePatientTypeVisibility();

  citySelect.value = city;
  const previousCity = typeof opdLastVisitingCity === "string" ? opdLastVisitingCity : "";
  updateNextFollowupCity(city, true, previousCity);
  if (city === "Latur") {
    document.getElementById("opdNextFollowupCity").value = "";
    if (typeof opdFollowupManuallyEdited !== "undefined") opdFollowupManuallyEdited = false;
  } else {
    document.getElementById("opdNextFollowupCity").value = city;
  }
  if (typeof opdLastVisitingCity !== "undefined") opdLastVisitingCity = city;

  document.getElementById("opdPaymentMode").value = "Cash";
  document.getElementById("opdCashPaid").value = "500";
  document.getElementById("opdOnlinePaid").value = "";
  updateOpdPaymentVisibility();
  updateOpdSplitTotal();
  renderOpdFieldErrors({});
  document.getElementById("opdFormError").textContent = "";

  const dateRaw = String(record.visitingDate || "").trim();
  let visitDateLabel = dateRaw;
  if (/^\d{8}$/.test(dateRaw)) visitDateLabel = dateRaw.slice(6, 8) + "/" + dateRaw.slice(4, 6) + "/" + dateRaw.slice(0, 4);
  const notice = document.getElementById("opdPreBookingPrefillNotice");
  notice.hidden = false;
  notice.textContent = `Patient details were copied from PreBooking ${record.appointmentId}. Requested visit date: ${visitDateLabel}. The OPD form uses today's date only; if the requested date is in the future, keep the PreBooking record pending and do not submit this OPD form today. Verify WhatsApp again. The PreBooking Request ID is not used as an OPD booking identity.`;
  if (typeof setView === "function") setView("opd");
  showToast("PreBooking patient details copied to the OPD form. Verify all details before booking.");
}

window.prefillOpdFromPreBooking = prefillOpdFromPreBooking;

/** Handoff from the Follow-up workspace into OPD booking using the exact selected
 * historical record. The historical row identity is used only to select the patient;
 * it is never reused as a new OPD booking/request identity.
 */
function prefillOpdFromFollowup(patient) {
  if (!patient || !String(patient.name || "").trim() || !Number.isInteger(Number(patient.sourceRow)) || Number(patient.sourceRow) < 1 || !String(patient.date || "").trim()) {
    showToast("The selected Follow-up record does not have a verified patient identity.");
    return false;
  }
  const city = normalizeCity(patient.city);
  // Enter the OPD workspace first so its city options and form controls are initialized.
  if (typeof setView === "function") setView("opd");
  const citySelect = document.getElementById("opdVisitingCity");
  if (!city || !citySelect || !Array.from(citySelect.options).some((option) => option.value === city && !option.disabled)) {
    showToast("The historical city is not currently available for OPD booking under this account and schedule. No patient data was copied.");
    return false;
  }
  const patientType = document.getElementById("opdPatientType");
  if (!patientType) return false;
  patientType.value = "Follow-up";
  patientType.dispatchEvent(new Event("change", { bubbles: true }));
  citySelect.value = city;
  citySelect.dispatchEvent(new Event("change", { bubbles: true }));
  // The city change handler clears any prior selection; now select the precise row.
  selectOpdFollowupPatient(patient);
  const notice = document.getElementById("opdPreBookingPrefillNotice");
  if (notice) {
    notice.hidden = false;
    notice.textContent = "Patient details were copied from the selected Follow-up record (previous visit: " + String(patient.date || "date unavailable") + "). This historical record is selected for identity validation; it does not become the new OPD booking ID. Verify current details and the Next Follow-up City before submitting.";
  }
  showToast("Selected Follow-up patient copied to OPD booking. Verify details before submission.");
  return true;
}
window.prefillOpdFromFollowup = prefillOpdFromFollowup;

function initializeOpdBookingFeature() {
  const form = document.getElementById("opdBookingForm");
  form.addEventListener("submit", submitOpdBooking);
  document.getElementById("opdVisitingCity").addEventListener("change", (event) => {
    if (opdSelectedFollowupPatient) clearOpdFollowupSelection(true);
    const previousCity = opdLastVisitingCity;
    updateNextFollowupCity(event.target.value, false, previousCity);
    clearOpdFieldError("city"); clearOpdFieldError("nextCity");
    opdLastVisitingCity = event.target.value;
    document.getElementById("opdFormError").textContent = "";
  });
  document.getElementById("opdNextFollowupCity").addEventListener("change", () => { opdFollowupManuallyEdited = true; clearOpdFieldError("nextCity"); });
  document.getElementById("opdPatientType").addEventListener("change", () => { clearOpdFollowupSelection(true); updatePatientTypeVisibility(); ["verifyWhatsapp", "referredBy", "nextCity", "name"].forEach(clearOpdFieldError); document.getElementById("opdFormError").textContent = ""; });
  document.getElementById("opdFollowupSearchButton").addEventListener("click", searchOpdFollowupPatients);
  document.getElementById("opdFollowupSearch").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchOpdFollowupPatients(); } });
  document.getElementById("opdFollowupChangePatient").addEventListener("click", () => clearOpdFollowupSelection(true));
  const textFieldMap = { opdPatientName: "name", opdAge: "age", opdAddress: "address", opdReferredBy: "referredBy" };
  Object.entries(textFieldMap).forEach(([id, field]) => document.getElementById(id).addEventListener("input", () => clearOpdFieldError(field)));
  document.getElementById("opdPaymentMode").addEventListener("change", () => { updateOpdPaymentVisibility(); ["cash", "online"].forEach(clearOpdFieldError); document.getElementById("opdFormError").textContent = ""; });
  document.querySelectorAll('input[name="opdReferralMode"]').forEach((radio) => radio.addEventListener("change", () => { updatePatientTypeVisibility(); clearOpdFieldError("referredBy"); }));
  document.getElementById("opdResetButton").addEventListener("click", () => { clearOpdFollowupSelection(true); resetOpdForm(); });
  document.getElementById("opdBackButton").addEventListener("click", () => setView("home"));
  document.getElementById("opdShowUpdateButton").addEventListener("click", () => showOpdUpdateWorkspace(true));
  document.getElementById("opdBackToBookingButton").addEventListener("click", () => showOpdUpdateWorkspace(false));
  ["opdWhatsapp", "opdVerifyWhatsapp", "opdCashPaid", "opdOnlinePaid"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, id.includes("Whatsapp") ? 10 : 4); clearOpdFieldError(id === "opdWhatsapp" ? "whatsapp" : id === "opdVerifyWhatsapp" ? "verifyWhatsapp" : id === "opdCashPaid" ? "cash" : "online"); if (id.includes("Paid")) updateOpdSplitTotal(); });
  });
}

