/* Phase 6.3: EEG update workflow kept separate from EEG booking. */
(function () {
  "use strict";
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  let patients = []; let selected = null; let initialized = false; let submitting = false;
  const $ = (id) => document.getElementById(id);
  function userSession() { try { return JSON.parse(sessionStorage.getItem("neuronWebsiteSession_v2") || "null"); } catch (_) { return null; } }
  function allowedCities() { const u = userSession(); if (!u) return []; if (u.admin || String(u.city || "").toLowerCase() === "latur") return CITIES.slice(); return CITIES.filter((c) => c.toLowerCase() === String(u.city || "").toLowerCase()); }
  function requestId() { return window.NeuronEegCommon.requestId("WEB_EEGUPD_"); }
  function setMode(update) { $("eegBookingPanel").hidden = update; $("eegUpdateWorkspace").hidden = !update; $("eegShowBookingButton").className = update ? "secondary-button" : "primary-button"; $("eegShowUpdateButton").className = update ? "primary-button" : "secondary-button"; if (update) loadPatients(); }
  function renderPatients() {
    const list = $("eegUpdatePatientList"); list.replaceChildren();
    if (!patients.length) { const empty = document.createElement("p"); empty.className = "field-hint"; empty.textContent = "No EEG-booked patients returned for this city. Check the city or refresh the list."; list.append(empty); return; }
    patients.forEach((patient) => { const card = document.createElement("button"); card.type = "button"; card.className = "opd-update-patient"; card.setAttribute("aria-pressed", String(selected === patient)); const title = document.createElement("strong"); title.textContent = String(patient.name || "Patient"); const meta = document.createElement("small"); meta.textContent = `${patient.appointmentId || "Appointment ID unavailable"} · ${patient.age || ""} ${patient.ageUnit || ""} · EEG ₹${Number(patient.eegCharges || 0)}`; card.append(title, meta); card.addEventListener("click", () => selectPatient(patient)); list.append(card); });
  }
  async function loadPatients() {
    const city = $("eegUpdateCity").value; selected = null; patients = []; $("eegUpdateForm").hidden = true; $("eegUpdateResult").hidden = true; $("eegUpdatePatientList").replaceChildren();
    if (!city) { $("eegUpdateMessage").textContent = "Select a city."; return; }
    const u = userSession(); if (!u || !u.username || !u.password) { $("eegUpdateMessage").textContent = "Your session is unavailable. Sign in again."; return; }
    $("eegUpdateMessage").textContent = "Loading EEG-booked patients…";
    try {
      const date = indiaDateParts();
      const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify({ action: "getTodayOPDFromProperties", city, date: date.key, username: u.username, password: u.password, installationId: getInstallationId(), sessionId: u.sessionId || "" }), cache: "no-store", redirect: "follow" });
      if (!response.ok) throw new Error("Patient list request failed (HTTP " + response.status + ").");
      const data = await response.json();
      if (data.ok !== true || data.city !== city || data.date !== date.key || data.complete !== true || !Array.isArray(data.patients)) throw new Error(data.error || "The OPD patient list could not be verified as a complete current-day snapshot.");
      patients = data.patients.filter((p) => p && p.eegCharges !== null && p.eegCharges !== undefined && String(p.eegCharges).trim() !== "" && String(p.bookingRequestId || "").trim() && String(p.appointmentId || "").trim());
      $("eegUpdateMessage").textContent = `${patients.length} EEG-booked patient(s) loaded from the complete current-day OPD snapshot for ${city}.`; renderPatients();
    } catch (error) { patients = []; renderPatients(); $("eegUpdateMessage").textContent = error && error.message || "Unable to load EEG patients."; }
  }
  function selectPatient(patient) {
    selected = patient; $("eegUpdateCharges").value = String(Number(patient.eegCharges || 0));
    const cash = Number(patient.eegCashPaid || 0); const online = Number(patient.eegOnlinePaid || 0); const mode = cash > 0 && online > 0 ? "Split" : online > 0 ? "Online" : "Cash";
    $("eegUpdatePaymentMode").value = mode; $("eegUpdateCash").value = String(cash); $("eegUpdateOnline").value = String(online);
    $("eegUpdateSelectedHeading").textContent = "Edit " + String(patient.appointmentId || "selected EEG booking"); $("eegUpdateFormError").textContent = ""; $("eegUpdateForm").hidden = false; $("eegUpdateResult").hidden = true;
    Array.from(document.querySelectorAll("#eegUpdatePatientList .opd-update-patient")).forEach((node, i) => node.classList.toggle("selected", patients[i] === patient)); paymentVisibility();
  }
  function paymentVisibility() { const mode = $("eegUpdatePaymentMode").value; $("eegUpdateCashGroup").hidden = mode === "Online"; $("eegUpdateOnlineGroup").hidden = mode === "Cash"; }
  function showResult(mutation) {
    const result = $("eegUpdateResult"); result.hidden = false; result.replaceChildren(); const state = window.NeuronMutations.presentation(mutation.status); const heading = document.createElement("h3"); heading.textContent = state.label; const message = document.createElement("p"); message.textContent = mutation.errorMessage || state.message; result.append(heading, message);
    if (["PENDING", "UNKNOWN", "IN_FLIGHT"].includes(mutation.status)) { const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button"; check.textContent = "Check update status"; check.addEventListener("click", () => checkStatus(mutation.requestId)); result.append(check); if (mutation.status === "UNKNOWN") { const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry same update"; retry.addEventListener("click", () => retryUpdate(mutation.requestId)); result.append(retry); } }
    if (mutation.status === "CONFIRMED") { const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "secondary-button"; refresh.textContent = "Reload EEG patients"; refresh.addEventListener("click", loadPatients); result.append(refresh); }
  }
  async function checkStatus(req) {
    const mutation = await window.NeuronMutations.get(req); if (!mutation) return; const u = userSession(); if (!u) return;
    try { const p = mutation.payload; const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify({ action: "checkMutationStatus", eventType: "EEG_UPDATE", mutationId: mutation.mutationId, bookingRequestId: p.bookingRequestId, appointmentId: mutation.appointmentId || "", city: mutation.city, recovery: true, username: u.username, password: u.password, installationId: getInstallationId(), sessionId: u.sessionId || "", sourceFcmToken: "" }), cache: "no-store", redirect: "follow" }); const data = await response.json(); const queuedMatch = data.found === true && data.source === "FCM_EVENT" && data.eventType === "EEG_UPDATE" && data.mutationId === mutation.mutationId && data.bookingRequestId === p.bookingRequestId; await window.NeuronMutations.markUnknown(req, queuedMatch ? "A matching FCM event is queued; the FCM handler must still confirm this update." : "EEG update status check did not return conclusive confirmation."); } catch (_) { await window.NeuronMutations.markUnknown(req, "EEG update status could not be verified."); }
    showResult(await window.NeuronMutations.get(req) || mutation);
  }
  async function retryUpdate(req) { const current = await window.NeuronMutations.get(req); if (!current || current.status !== "UNKNOWN" || submitting) return; try { const envelope = await window.NeuronMutations.retryEnvelope(req); const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow" }); let body = null; try { body = await response.json(); } catch (_) {} await window.NeuronMutations.classifyTransportResult(req, { ok: response.ok }, body); } catch (_) { await window.NeuronMutations.markUnknown(req, "EEG update retry outcome remains uncertain; the original mutation ID is retained."); } showResult(await window.NeuronMutations.get(req) || current); }
  async function submit(event) {
    event.preventDefault(); if (submitting || !selected) return; const err = $("eegUpdateFormError"); err.textContent = "";
    const charges = Number($("eegUpdateCharges").value); const mode = $("eegUpdatePaymentMode").value; const cash = mode === "Online" ? 0 : Number($("eegUpdateCash").value || 0); const online = mode === "Cash" ? 0 : Number($("eegUpdateOnline").value || 0); const total = cash + online;
    if (!Number.isFinite(charges) || charges < 0 || charges > 3000 || !Number.isFinite(cash) || cash < 0 || !Number.isFinite(online) || online < 0 || total > charges + 0.001) { err.textContent = "Enter valid EEG charges (₹0–₹3,000) and payment. Total paid cannot exceed EEG charges."; return; }
    const u = userSession(); if (!u || !u.username || !u.password) { err.textContent = "Your session is unavailable. Sign in again."; return; }
    if (!selected.bookingRequestId || !selected.appointmentId) { err.textContent = "The selected EEG record lacks booking identity. Update was not sent."; return; }
    submitting = true; const button = $("eegUpdateSubmitButton"); button.disabled = true; button.textContent = "Saving EEG update…";
    const mutationId = window.NeuronMutations.newMutationId(); const req = requestId(); const city = selected.city || $("eegUpdateCity").value;
    const payload = { action: "updateEEGDetails", city, bookingRequestId: selected.bookingRequestId, mutationId, sourceInstallationId: getInstallationId(), sourceFcmToken: "", eegCharges: charges, eegPaymentMode: mode, eegCashPaid: mode === "Online" ? "" : cash, eegOnlinePaid: mode === "Cash" ? "" : online, username: u.username, password: u.password, installationId: getInstallationId(), sessionId: u.sessionId || "" };
    try { await window.NeuronDataReady; await window.NeuronMutations.create({ requestId: req, mutationId, eventType: "EEG_UPDATE", scope: "opdToday", city, date: indiaDateParts().key, recordId: selected.bookingRequestId, appointmentId: selected.appointmentId, payload }); const envelope = await window.NeuronMutations.retryEnvelope(req); try { const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow" }); let body = null; try { body = await response.json(); } catch (_) {} await window.NeuronMutations.classifyTransportResult(req, { ok: response.ok }, body); } catch (_) { await window.NeuronMutations.markUnknown(req, "EEG update may have committed; do not submit it again with a new mutation ID."); } showResult(await window.NeuronMutations.get(req)); }
    catch (error) { err.textContent = error && error.message || "Unable to save EEG update."; }
    finally { submitting = false; button.disabled = false; button.textContent = "Save EEG update"; }
  }
  function init() { if (initialized) return; initialized = true; const city = $("eegUpdateCity"); allowedCities().forEach((name) => { const o = document.createElement("option"); o.value = name; o.textContent = name; city.append(o); }); city.addEventListener("change", loadPatients); $("eegUpdateRefreshButton").addEventListener("click", loadPatients); $("eegUpdatePaymentMode").addEventListener("change", paymentVisibility); $("eegUpdateForm").addEventListener("submit", submit); $("eegShowBookingButton").addEventListener("click", () => setMode(false)); $("eegShowUpdateButton").addEventListener("click", () => setMode(true)); }
  window.initializeEegUpdateFeature = init;
})();
