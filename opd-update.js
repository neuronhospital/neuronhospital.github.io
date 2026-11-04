"use strict";

let opdUpdatePatients = [];
let opdUpdateSelected = null;
let opdUpdateSubmitting = false;

function showOpdUpdateWorkspace(show) {
  document.getElementById("opdBookingPanel").hidden = show;
  document.getElementById("opdUpdateWorkspace").hidden = !show;
  document.getElementById("opdResultPanel").hidden = true;
  if (show) loadOpdUpdatePatients();
}

function updateOpdUpdateCityChoices() {
  const select = document.getElementById("opdUpdateCity");
  const cities = allowedAccountCities();
  const prior = select.value;
  setSelectOptions(select, cities, "Select city", cities.includes(prior) ? prior : (cities.includes(document.getElementById("opdVisitingCity").value) ? document.getElementById("opdVisitingCity").value : cities[0] || ""));
}

async function loadOpdUpdatePatients() {
  const city = document.getElementById("opdUpdateCity").value;
  const list = document.getElementById("opdUpdatePatientList");
  const message = document.getElementById("opdUpdateMessage");
  const form = document.getElementById("opdUpdateForm");
  form.hidden = true;
  list.replaceChildren();
  if (!city) { message.textContent = "Choose a city to load today's OPD patients."; return; }
  message.textContent = "Loading today's OPD patients…";
  try {
    await window.NeuronDataReady;
    const date = indiaDateParts();
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify({ action: "getTodayOPDFromProperties", city, date: date.key,
        username: activeUser.username, password: activeUser.password,
        installationId: getInstallationId(), sessionId: activeUser.sessionId || "" }),
      cache: "no-store", redirect: "follow"
    });
    if (!response.ok) throw new Error("Patient list request failed (HTTP " + response.status + ").");
    const data = await response.json();
    if (data.ok !== true || data.city !== city || data.date !== date.key || data.complete !== true || !Array.isArray(data.patients)) {
      throw new Error(data.error || "The OPD patient list could not be verified as a complete current-day snapshot.");
    }
    opdUpdatePatients = data.patients;
    message.textContent = opdUpdatePatients.length ? opdUpdatePatients.length + " patient(s) loaded from the current OPD cache." : "No OPD patients found for " + city + " today.";
    opdUpdatePatients.forEach((patient) => {
      const card = document.createElement("button");
      card.type = "button"; card.className = "opd-update-patient";
      const title = document.createElement("strong"); title.textContent = String(patient.name || "Patient");
      const meta = document.createElement("small"); meta.textContent = String(patient.appointmentId || "") + " · " + String(patient.age || "") + " " + String(patient.ageUnit || "") + " · OPD ₹" + String(patient.opdCharges || 0);
      card.append(title, meta);
      card.addEventListener("click", () => selectOpdUpdatePatient(patient));
      list.append(card);
    });
  } catch (error) {
    opdUpdatePatients = [];
    message.textContent = error instanceof Error ? error.message : "Unable to load OPD patients.";
  }
}

function selectOpdUpdatePatient(patient) {
  opdUpdateSelected = patient;
  const set = (id, value) => { document.getElementById(id).value = value == null ? "" : String(value); };
  set("opdUpdateName", patient.name);
  set("opdUpdateAge", patient.age);
  set("opdUpdateAgeUnit", ["days", "months", "years"].includes(patient.ageUnit) ? patient.ageUnit : "years");
  set("opdUpdateAddress", patient.address);
  set("opdUpdateWhatsapp", patient.whatsapp);
  set("opdUpdateReferredBy", patient.referredBy);
  setSelectOptions(document.getElementById("opdUpdateNextCity"), OPD_CITIES, "Select Followup City", normalizeCity(patient.nextFollowupCity) || normalizeCity(patient.city));
  set("opdUpdateCharges", patient.opdCharges || 0);
  const cash = Number(patient.opdCashPaid || 0);
  const online = Number(patient.opdOnlinePaid || 0);
  const mode = cash > 0 && online > 0 ? "Split" : online > 0 ? "Online" : "Cash";
  set("opdUpdatePaymentMode", mode);
  set("opdUpdateCash", cash);
  set("opdUpdateOnline", online);
  document.getElementById("opdUpdateSelectedHeading").textContent = "Edit " + String(patient.appointmentId || "selected appointment");
  document.getElementById("opdUpdateFormError").textContent = "";
  document.getElementById("opdUpdateForm").hidden = false;
  document.querySelectorAll(".opd-update-patient").forEach((card) => card.classList.remove("selected"));
  const selectedCard = Array.from(document.querySelectorAll(".opd-update-patient")).find((card) => card.querySelector("small")?.textContent.startsWith(String(patient.appointmentId || "")));
  if (selectedCard) selectedCard.classList.add("selected");
  updateOpdUpdatePaymentVisibility();
}

function updateOpdUpdatePaymentVisibility() {
  const mode = document.getElementById("opdUpdatePaymentMode").value;
  document.getElementById("opdUpdateCashGroup").hidden = mode === "Online";
  document.getElementById("opdUpdateOnlineGroup").hidden = mode === "Cash";
}

function showOpdUpdateMutationResult(mutation) {
  const result = document.getElementById("opdUpdateResult");
  result.hidden = false; result.replaceChildren();
  const status = window.NeuronMutations.presentation(mutation.status);
  const heading = document.createElement("h3"); heading.textContent = status.label;
  const message = document.createElement("p"); message.textContent = mutation.errorMessage || status.message;
  result.append(heading, message);
  if (["UNKNOWN", "PENDING", "IN_FLIGHT"].includes(mutation.status)) {
    const id = document.createElement("small"); id.textContent = "Update request: " + mutation.requestId;
    const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button"; check.textContent = "Check update status";
    check.addEventListener("click", () => checkOpdUpdateMutationStatus(mutation.requestId));
    result.append(id, check);
    if (mutation.status === "UNKNOWN") {
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry same update request";
      retry.addEventListener("click", () => retryOpdUpdateMutation(mutation.requestId)); result.append(retry);
    }
  }
  if (mutation.status === "CONFIRMED") {
    const done = document.createElement("button"); done.type = "button"; done.className = "secondary-button"; done.textContent = "Reload patient list";
    done.addEventListener("click", loadOpdUpdatePatients); result.append(done);
  }
}

async function checkOpdUpdateMutationStatus(requestId) {
  const mutation = await window.NeuronMutations.get(requestId);
  if (!mutation) return;
  try {
    const payload = { action: "checkMutationStatus", eventType: "OPD_UPDATE", mutationId: mutation.mutationId,
      bookingRequestId: mutation.payload.bookingRequestId, appointmentId: mutation.payload.appointmentId || "", city: mutation.city, recovery: true,
      username: activeUser.username, password: activeUser.password, installationId: getInstallationId(), sessionId: activeUser.sessionId || "", sourceFcmToken: "" };
    const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(payload), cache: "no-store", redirect: "follow" });
    const data = await response.json();
    const queuedMatch = data.found === true && data.source === "FCM_EVENT" && data.eventType === "OPD_UPDATE" && data.mutationId === mutation.mutationId && data.bookingRequestId === mutation.payload.bookingRequestId;
    await window.NeuronMutations.markUnknown(requestId, queuedMatch
      ? "A matching FCM event is queued; the FCM handler must still confirm the update. Keep the same request identity."
      : "The status check did not return conclusive update confirmation. Keep the same request identity.");
    showOpdUpdateMutationResult(await window.NeuronMutations.get(requestId) || mutation);
  } catch (_) {
    showOpdUpdateMutationResult(await window.NeuronMutations.markUnknown(requestId, "The update result could not be verified.") || mutation);
  }
}

async function retryOpdUpdateMutation(requestId) {
  const current = await window.NeuronMutations.get(requestId);
  if (!current || current.status !== "UNKNOWN") return;
  try {
    const envelope = await window.NeuronMutations.retryEnvelope(requestId);
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow"
    });
    let body = null; try { body = await response.json(); } catch (_) {}
    await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
  } catch (_) {
    await window.NeuronMutations.markUnknown(requestId, "The update retry result remains uncertain. The original mutation ID is retained.");
  }
  showOpdUpdateMutationResult(await window.NeuronMutations.get(requestId) || current);
}

async function submitOpdUpdate(event) {
  event.preventDefault();
  if (opdUpdateSubmitting || !opdUpdateSelected) return;
  const err = document.getElementById("opdUpdateFormError");
  const name = document.getElementById("opdUpdateName").value.trim();
  const age = Number(document.getElementById("opdUpdateAge").value);
  const ageUnit = document.getElementById("opdUpdateAgeUnit").value;
  const address = document.getElementById("opdUpdateAddress").value.trim();
  const whatsapp = document.getElementById("opdUpdateWhatsapp").value.trim();
  const referredBy = document.getElementById("opdUpdateReferredBy").value.trim();
  const nextCity = document.getElementById("opdUpdateNextCity").value;
  const charges = Number(document.getElementById("opdUpdateCharges").value);
  const mode = document.getElementById("opdUpdatePaymentMode").value;
  const cash = mode === "Online" ? 0 : Number(document.getElementById("opdUpdateCash").value || 0);
  const online = mode === "Cash" ? 0 : Number(document.getElementById("opdUpdateOnline").value || 0);
  const total = cash + online;
  if (!/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(name) || (name.match(/[A-Za-z]/g) || []).length < 3) { err.textContent = "Enter a valid patient name."; return; }
  if (!Number.isFinite(age) || age <= 0 || age >= 100 || !["days", "months", "years"].includes(ageUnit)) { err.textContent = "Enter a valid age and unit."; return; }
  if (!/^[A-Za-z]+(?:\s*,?\s+[A-Za-z]+)*$/.test(address) || (address.match(/[A-Za-z]/g) || []).length < 3) { err.textContent = "Enter a valid address."; return; }
  if (!/^[6-9][0-9]{9}$/.test(whatsapp)) { err.textContent = "Enter a valid 10-digit WhatsApp number."; return; }
  if (referredBy && (!/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(referredBy) || (referredBy.match(/[A-Za-z]/g) || []).length < 3)) { err.textContent = "Enter a valid referred-by name."; return; }
  if (!OPD_CITIES.includes(nextCity)) { err.textContent = "Select a valid Next Follow-up City."; return; }
  if (!Number.isFinite(charges) || charges < 0 || charges > 2000 || !Number.isFinite(total) || total < 0 || total > charges) { err.textContent = "OPD charges/payment is invalid. Total paid cannot exceed charges or ₹2,000."; return; }
  if (!["Cash", "Online", "Split"].includes(mode)) { err.textContent = "Select a valid payment mode."; return; }
  opdUpdateSubmitting = true;
  const submit = document.getElementById("opdUpdateSubmitButton"); submit.disabled = true; submit.textContent = "Saving update…";
  err.textContent = "";
  const mutationId = window.NeuronMutations.newMutationId();
  const localRequestId = "OPDUPD_" + makeRequestId() + "_" + makeRequestId();
  const payload = { action: "updateOPDDetails", city: opdUpdateSelected.city || document.getElementById("opdUpdateCity").value,
    bookingRequestId: opdUpdateSelected.bookingRequestId, mutationId,
    sourceInstallationId: getInstallationId(), sourceFcmToken: "", name, age, ageUnit, address, whatsappNew: whatsapp,
    referredBy, nextFollowupCity: nextCity, opdCharges: charges, opdPaymentMode: mode,
    opdCashPaid: mode === "Online" ? "" : cash, opdOnlinePaid: mode === "Cash" ? "" : online,
    username: activeUser.username, password: activeUser.password, installationId: getInstallationId(), sessionId: activeUser.sessionId || "" };
  try {
    await window.NeuronDataReady;
    await window.NeuronMutations.create({ requestId: localRequestId, mutationId, eventType: "OPD_UPDATE", scope: "opdToday", city: payload.city, date: indiaDateParts().key, recordId: payload.bookingRequestId, payload });
    const envelope = await window.NeuronMutations.retryEnvelope(localRequestId);
    try {
      const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow" });
      let body = null; try { body = await response.json(); } catch (_) {}
      await window.NeuronMutations.classifyTransportResult(localRequestId, { ok: response.ok }, body);
    } catch (_) {
      await window.NeuronMutations.markUnknown(localRequestId, "The update request may have committed. Do not repeat it with a new mutation ID.");
    }
    showOpdUpdateMutationResult(await window.NeuronMutations.get(localRequestId));
  } catch (error) {
    err.textContent = error instanceof Error ? error.message : "Unable to persist the update request.";
  } finally {
    opdUpdateSubmitting = false; submit.disabled = false; submit.textContent = "Save OPD update";
  }
}

function initializeOpdUpdateFeature() {
  updateOpdUpdateCityChoices();
  document.getElementById("opdUpdateCity").addEventListener("change", loadOpdUpdatePatients);
  document.getElementById("opdUpdateRefreshButton").addEventListener("click", loadOpdUpdatePatients);
  document.getElementById("opdUpdatePaymentMode").addEventListener("change", updateOpdUpdatePaymentVisibility);
  document.getElementById("opdUpdateForm").addEventListener("submit", submitOpdUpdate);
  document.getElementById("opdUpdateWhatsapp").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 10); });
  ["opdUpdateCash", "opdUpdateOnline", "opdUpdateCharges"].forEach((id) => document.getElementById(id).addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 4); }));
}

