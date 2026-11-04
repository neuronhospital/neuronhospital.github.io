"use strict";

let opdUpdatePatients = [];
let opdUpdateSelected = null;
let opdUpdateSubmitting = false;
let opdUpdateSearchQuery = "";

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
  opdUpdateSelected = null;
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
    // Backend snapshot is already scoped to the selected city and India-local today.
    // Search operates only on this verified complete snapshot.
    opdUpdatePatients = data.patients.filter((patient) =>
      patient && typeof patient === "object" && String(patient.bookingRequestId || "").trim()
    );
    const search = document.getElementById("opdUpdateSearch");
    opdUpdateSearchQuery = search ? search.value : "";
    document.getElementById("opdUpdateDateScope").textContent = "Appointment date: " + date.key + " (today, India time) · City: " + city;
    message.textContent = opdUpdatePatients.length ? opdUpdatePatients.length + " patient(s) loaded from the complete current-day snapshot." : "No OPD patients found for " + city + " today.";
    renderOpdUpdatePatientList();
  } catch (error) {
    opdUpdatePatients = [];
    message.textContent = error instanceof Error ? error.message : "Unable to load OPD patients.";
  }
}

function renderOpdUpdatePatientList() {
  const list = document.getElementById("opdUpdatePatientList");
  const query = String(document.getElementById("opdUpdateSearch")?.value || "").trim().toLocaleLowerCase();
  list.replaceChildren();
  const filtered = opdUpdatePatients.filter((patient) => {
    const searchable = [patient.name, patient.appointmentId, patient.whatsapp, patient.bookingRequestId]
      .map((value) => String(value || "").toLocaleLowerCase()).join(" ");
    return !query || searchable.includes(query);
  });
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = query ? "No matching patient found in today's selected-city OPD list." : "No patients are available for this city and date.";
    list.append(empty);
    return;
  }
  filtered.forEach((patient) => {
    const card = document.createElement("button");
    card.type = "button"; card.className = "opd-update-patient";
    card.dataset.bookingRequestId = String(patient.bookingRequestId);
    card.setAttribute("aria-pressed", String(opdUpdateSelected?.bookingRequestId === patient.bookingRequestId));
    if (opdUpdateSelected?.bookingRequestId === patient.bookingRequestId) card.classList.add("selected");
    const title = document.createElement("strong"); title.textContent = String(patient.name || "Patient");
    const meta = document.createElement("span");
    meta.textContent = [String(patient.appointmentId || "Appointment ID unavailable"), (String(patient.age || "") + " " + String(patient.ageUnit || "")).trim(), patient.whatsapp ? "WhatsApp " + String(patient.whatsapp) : "WhatsApp unavailable"].filter(Boolean).join(" · ");
    const charges = document.createElement("span"); charges.textContent = "OPD ₹" + String(patient.opdCharges ?? 0) + " · " + String(patient.city || document.getElementById("opdUpdateCity").value);
    card.append(title, meta, charges);
    card.addEventListener("click", () => selectOpdUpdatePatient(patient));
    list.append(card);
  });
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
  // Appointment identity and the non-mutated booking attributes are context only.
  // The Android update payload does not permit changing these fields.
  const lockedValues = {
    opdUpdateLockedAppointmentId: patient.appointmentId,
    opdUpdateLockedDate: patient.date || patient.appointmentDate,
    opdUpdateLockedTime: patient.time,
    opdUpdateLockedCity: patient.city,
    opdUpdateLockedPatientType: patient.patientType
  };
  Object.entries(lockedValues).forEach(([id, value]) => {
    document.getElementById(id).textContent = String(value || "—");
  });
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
  renderOpdUpdatePatientList();
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
  window.NeuronMutations.renderStatus(result, mutation, { payment: true });
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
    // Confirmation means the backend committed the update. Refresh the scoped
    // snapshot so the editor/list no longer displays stale patient values.
    loadOpdUpdatePatients().catch(() => {});
  }
  refreshOpdUpdatePending().catch(() => {});
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
    await refreshOpdUpdatePending();
  } catch (_) {
    showOpdUpdateMutationResult(await window.NeuronMutations.markUnknown(requestId, "The update result could not be verified.") || mutation);
    await refreshOpdUpdatePending();
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
    const classified = await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
    if (classified?.state === "CONFIRMED") notifyTodayOpdMutationConfirmed({ eventType: "OPD_UPDATE",
      city: current.city, date: current.date, bookingRequestId: current.payload.bookingRequestId,
      appointmentId: current.payload.appointmentId || "" });
  } catch (_) {
    await window.NeuronMutations.markUnknown(requestId, "The update retry result remains uncertain. The original mutation ID is retained.");
  }
  showOpdUpdateMutationResult(await window.NeuronMutations.get(requestId) || current);
  await refreshOpdUpdatePending();
}

function opdUpdateHasChanges(patient, values) {
  const originalCash = Number(patient.opdCashPaid || 0);
  const originalOnline = Number(patient.opdOnlinePaid || 0);
  const originalMode = originalCash > 0 && originalOnline > 0 ? "Split" : originalOnline > 0 ? "Online" : "Cash";
  const nextCityOriginal = String(patient.nextFollowupCity || patient.city || "").trim();
  return String(values.name).trim().toLocaleLowerCase() !== String(patient.name || "").trim().toLocaleLowerCase() ||
    Number(values.age) !== Number(patient.age) || String(values.ageUnit).toLowerCase() !== String(patient.ageUnit || "years").toLowerCase() ||
    String(values.address).trim() !== String(patient.address || "").trim() ||
    String(values.whatsapp).replace(/\D/g, "") !== String(patient.whatsapp || "").replace(/\D/g, "") ||
    String(values.referredBy).trim().toLocaleLowerCase() !== String(patient.referredBy || "").trim().toLocaleLowerCase() ||
    String(values.nextCity).trim() !== nextCityOriginal || values.mode !== originalMode ||
    Number(values.cash) !== originalCash || Number(values.online) !== originalOnline || Number(values.charges) !== Number(patient.opdCharges || 0);
}

async function refreshOpdUpdatePending() {
  const section = document.getElementById("opdUpdatePendingSection");
  const list = document.getElementById("opdUpdatePendingList");
  if (!section || !list || !window.NeuronMutations) return;
  try {
    await window.NeuronDataReady;
    let all = (await window.NeuronMutations.list()).filter((item) => item.eventType === "OPD_UPDATE" &&
      ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status));
    // Recover only attempts whose persisted in-flight lease has expired. A live
    // request is not changed while its last attempt is still within the lease.
    for (const item of all) {
      if (item.status === "IN_FLIGHT" && Date.now() - Number(item.lastAttemptAt || item.updatedAt || 0) >= 60000) {
        await window.NeuronMutations.recoverStaleInFlight(item.requestId);
      }
    }
    all = (await window.NeuronMutations.list()).filter((item) => item.eventType === "OPD_UPDATE" &&
      ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status));
    const items = all.sort((a, b) => b.createdAt - a.createdAt);
    list.replaceChildren(); section.hidden = !items.length;
    items.forEach((item) => {
      const card = document.createElement("article"); card.className = "opd-update-pending-item";
      const heading = document.createElement("strong"); heading.textContent = String(item.payload?.name || "Patient") + " · " + window.NeuronMutations.presentation(item.status).label;
      const detail = document.createElement("p"); detail.textContent = "Appointment " + String(item.payload?.appointmentId || item.recordId || "—") + " · Request " + item.requestId + " · " + window.NeuronMutations.presentation(item.status).message;
      card.append(heading, detail);
      const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button"; check.textContent = "Check status"; check.addEventListener("click", () => checkOpdUpdateMutationStatus(item.requestId)); card.append(check);
      if (["PENDING", "UNKNOWN"].includes(item.status)) { const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry same request"; retry.addEventListener("click", () => retryOpdUpdateMutation(item.requestId)); card.append(retry); }
      else { const wait = document.createElement("small"); wait.textContent = "The request is still within its active attempt window."; card.append(wait); }
      list.append(card);
    });
  } catch (_) { section.hidden = false; list.textContent = "Unable to load saved OPD update requests."; }
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
  if (!Number.isFinite(age) || age < 0 || !["days", "months", "years"].includes(ageUnit)) { err.textContent = "Enter a valid age (0 or greater) and unit."; return; }
  if (!address) { err.textContent = "Enter the patient address."; return; }
  if (!/^[6-9][0-9]{9}$/.test(whatsapp)) { err.textContent = "Enter a valid 10-digit WhatsApp number."; return; }
  if (referredBy && (!/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(referredBy) || (referredBy.match(/[A-Za-z]/g) || []).length < 3)) { err.textContent = "Enter a valid referred-by name."; return; }
  if (!OPD_CITIES.includes(nextCity)) { err.textContent = "Select a valid Next Follow-up City."; return; }
  if (!Number.isFinite(charges) || charges < 0 || charges > 2000 || !Number.isFinite(total) || total < 0 || total > charges) { err.textContent = "OPD charges must be ₹0–₹2,000, and total payment cannot exceed charges."; return; }
  if (!["Cash", "Online", "Split"].includes(mode)) { err.textContent = "Select a valid payment mode."; return; }
  const values = { name, age, ageUnit, address, whatsapp, referredBy, nextCity, charges, mode, cash, online };
  if (!opdUpdateHasChanges(opdUpdateSelected, values)) { err.textContent = "No changes detected. Update at least one field before saving."; return; }
  try {
    const unresolved = (await window.NeuronMutations.list()).filter((item) => item.eventType === "OPD_UPDATE" &&
      item.recordId === String(opdUpdateSelected.bookingRequestId) && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status));
    if (unresolved.length) { err.textContent = "An OPD update for this patient is already unresolved (request " + unresolved[0].requestId + "). Check or retry that request before creating another."; await refreshOpdUpdatePending(); return; }
  } catch (storageError) { err.textContent = storageError.message || "Unable to verify pending updates."; return; }
  const paymentSummary = mode === "Split" ? `Cash ${window.NeuronMutations.money(cash)} + Online ${window.NeuronMutations.money(online)} = ${window.NeuronMutations.money(total)}` : `${mode}: ${window.NeuronMutations.money(total)}`;
  const accepted = await window.NeuronMutations.confirmOperation({ title: "Confirm OPD update", message: `Save updated details for ${name}?`, detail: `Appointment: ${opdUpdateSelected.appointmentId || opdUpdateSelected.bookingRequestId}\nNext follow-up city: ${nextCity}\nCharges: ${window.NeuronMutations.money(charges)}\n${paymentSummary}`, acceptLabel: "Save update" });
  if (!accepted) return;
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
      const classified = await window.NeuronMutations.classifyTransportResult(localRequestId, { ok: response.ok }, body);
      if (classified?.state === "CONFIRMED") {
        notifyTodayOpdMutationConfirmed({ eventType: "OPD_UPDATE", city: payload.city,
          date: indiaDateParts().key, bookingRequestId: payload.bookingRequestId,
          appointmentId: opdUpdateSelected?.appointmentId || "" });
      }
    } catch (_) {
      await window.NeuronMutations.markUnknown(localRequestId, "The update request may have committed. Do not repeat it with a new mutation ID.");
    }
    showOpdUpdateMutationResult(await window.NeuronMutations.get(localRequestId));
    await refreshOpdUpdatePending();
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
  document.getElementById("opdUpdateSearch").addEventListener("input", renderOpdUpdatePatientList);
  document.getElementById("opdUpdatePaymentMode").addEventListener("change", updateOpdUpdatePaymentVisibility);
  document.getElementById("opdUpdateForm").addEventListener("submit", submitOpdUpdate);
  refreshOpdUpdatePending().catch(() => {});
  document.getElementById("opdUpdateWhatsapp").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 10); });
  ["opdUpdateCash", "opdUpdateOnline", "opdUpdateCharges"].forEach((id) => document.getElementById(id).addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, 4); }));
}

