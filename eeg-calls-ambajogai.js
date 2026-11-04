"use strict";

(function () {
  const EVENT_TYPE = "AMB_EEG_CALLS_BOOKING";
  const CITY = "Ambajogai";
  const $ = (id) => document.getElementById(id);
  let initialized = false;
  let submitting = false;

  function makeBookingRequestId() { return window.NeuronEegCommon.makeBookingRequestId(); }
  function indiaDateKey() { return window.NeuronEegCommon.indiaDateKey(); }
  function readValues() {
    return {
      patientName: $("eegCallsAmbajogaiName").value.trim().replace(/\s+/g, " "),
      age: Number($("eegCallsAmbajogaiAge").value),
      ageUnit: $("eegCallsAmbajogaiAgeUnit").value,
      referredBy: $("eegCallsAmbajogaiReferredBy").value.trim().replace(/\s+/g, " "),
      eegTechnician: $("eegCallsAmbajogaiTechnician").value.trim().replace(/\s+/g, " ")
    };
  }
  function validate(values) {
    if (!/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(values.patientName) || (values.patientName.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid patient name using English alphabets, periods, slash, and digits 1, 2, or 3 only.";
    if (!Number.isFinite(values.age) || values.age <= 0 || values.age >= 100) return "Age must be greater than 0 and less than 100.";
    if (!["years", "months", "days"].includes(values.ageUnit)) return "Select a valid age unit.";
    if (!values.referredBy) return "Referred By is required.";
    if (!/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(values.referredBy) || (values.referredBy.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid referral using English alphabets and '.' only.";
    if (!/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(values.eegTechnician) || (values.eegTechnician.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid EEG Technician name using English alphabets only.";
    return "";
  }
  function credentials() {
    const session = typeof activeUser !== "undefined" ? activeUser : window.activeUser;
    if (!session || !(session.admin === true || session.eegcalls === true)) throw new Error("Your account does not have access to Ambajogai EEG Calls.");
    return session;
  }
  function renderResult(mutation) {
    const target = $("eegCallsAmbajogaiResult");
    target.hidden = false;
    target.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = mutation.status === "CONFIRMED" ? "Ambajogai EEG Call appointment confirmed" : "Ambajogai EEG Call request saved";
    const message = document.createElement("p");
    message.textContent = window.NeuronMutations.presentation(mutation.status).message;
    target.append(heading, message);
    const detail = document.createElement("small");
    detail.textContent = mutation.status === "CONFIRMED" ? "Appointment ID: " + mutation.appointmentId + " · Patient: " + mutation.payload.patientName : "Request ID: " + mutation.requestId;
    target.append(detail);
  }
  async function postPayload(payload) { return window.NeuronEegCommon.post(payload, 35000); }
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const errorEl = $("eegCallsAmbajogaiError"); errorEl.textContent = "";
    let session; try { session = credentials(); } catch (error) { errorEl.textContent = error.message; return; }
    const values = readValues(); const validation = validate(values);
    if (validation) { errorEl.textContent = validation; return; }
    try {
      await window.NeuronDataReady;
      const unresolved = (await window.NeuronMutations.list()).filter((item) => item.eventType === EVENT_TYPE && item.city === CITY && item.date === indiaDateKey() && item.payload && item.payload.patientName.toLowerCase() === values.patientName.toLowerCase() && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status));
      if (unresolved.length) { renderResult(unresolved[0]); errorEl.textContent = "A matching request is unresolved. Check or retry that saved request before creating another."; return; }
    } catch (_) { errorEl.textContent = "Local mutation storage is unavailable. No request was sent."; return; }

    const requestId = makeBookingRequestId();
    const mutationId = window.NeuronMutations.newMutationId();
    const payload = { action: "bookAmbajogaiEEGCallsAppointment", bookingRequestId: requestId, patientName: values.patientName, age: values.age, ageUnit: values.ageUnit, referredBy: values.referredBy, eegTechnician: values.eegTechnician, mutationId, sourceInstallationId: getInstallationId(), sourceFcmToken: "", installationId: getInstallationId(), username: session.username, password: session.password, sessionId: session.sessionId || "" };
    submitting = true; const button = $("eegCallsAmbajogaiSubmitButton"); button.disabled = true; button.textContent = "Submitting…";
    try {
      const created = await window.NeuronMutations.create({ requestId, mutationId, eventType: EVENT_TYPE, scope: "eegCallsAmbajogai", city: CITY, date: indiaDateKey(), payload });
      const envelope = await window.NeuronMutations.retryEnvelope(requestId);
      try {
        const { response, body } = await postPayload(envelope.payload);
        await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
        const current = await window.NeuronMutations.get(requestId); renderResult(current || created.mutation);
        if (current && current.status === "CONFIRMED") resetForm();
      } catch (_) {
        const unknown = await window.NeuronMutations.markUnknown(requestId, "The transport result is uncertain. Keep the same request identity; do not create a new request.");
        renderResult(unknown || created.mutation);
      }
    } catch (error) {
      errorEl.textContent = error.message || "Unable to persist the booking request.";
      const saved = await window.NeuronMutations.get(requestId).catch(() => null); if (saved) renderResult(saved);
    } finally { submitting = false; button.disabled = false; button.textContent = "Book Ambajogai EEG Call"; await refreshPending(); }
  }
  async function checkStatus(requestId) {
    const mutation = await window.NeuronMutations.get(requestId); if (!mutation) return;
    const session = credentials();
    try {
      const { body } = await postPayload({ action: "checkAmbajogaiEEGCallsBookingRequest", bookingRequestId: mutation.requestId, mutationId: mutation.mutationId, username: session.username, password: session.password, installationId: getInstallationId(), sessionId: session.sessionId || "", sourceInstallationId: getInstallationId(), sourceFcmToken: "" });
      if (body && body.found === true && body.bookingRequestId === mutation.requestId && body.appointmentId && (!body.mutationId || body.mutationId === mutation.mutationId)) {
        await window.NeuronMutations.confirm(requestId, { ...body, requestId: mutation.requestId, mutationId: mutation.mutationId, eventType: EVENT_TYPE, ok: true }, "HTTP");
      }
      const latest = await window.NeuronMutations.get(requestId); if (latest) renderResult(latest);
    } catch (_) { await window.NeuronMutations.markUnknown(requestId, "The status check could not verify the request."); }
    await refreshPending();
  }
  async function retry(requestId) {
    const mutation = await window.NeuronMutations.get(requestId); if (!mutation || !["UNKNOWN", "PENDING"].includes(mutation.status)) return;
    try { const envelope = await window.NeuronMutations.retryEnvelope(requestId); const { response, body } = await postPayload(envelope.payload); await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body); }
    catch (_) { await window.NeuronMutations.markUnknown(requestId, "Retry outcome remains uncertain. Original request identity retained."); }
    const latest = await window.NeuronMutations.get(requestId); if (latest) renderResult(latest); await refreshPending();
  }
  async function refreshPending() {
    const list = $("eegCallsAmbajogaiPendingList");
    try {
      await window.NeuronDataReady;
      const records = (await window.NeuronMutations.list()).filter((item) => item.eventType === EVENT_TYPE && item.city === CITY && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status)).sort((a,b) => b.createdAt - a.createdAt);
      list.replaceChildren();
      if (!records.length) { const p = document.createElement("p"); p.className = "field-hint"; p.textContent = "No unresolved Ambajogai EEG Calls requests."; list.append(p); return; }
      records.forEach((record) => {
        const card = document.createElement("article"); card.className = "eeg-call-pending-item";
        const title = document.createElement("strong"); title.textContent = record.payload.patientName + " · " + window.NeuronMutations.presentation(record.status).label;
        const detail = document.createElement("p"); detail.textContent = "Request ID: " + record.requestId + " · " + window.NeuronMutations.presentation(record.status).message; card.append(title, detail);
        const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button"; check.textContent = "Check status"; check.addEventListener("click", () => checkStatus(record.requestId)); card.append(check);
        if (["UNKNOWN", "PENDING"].includes(record.status)) { const retryButton = document.createElement("button"); retryButton.type = "button"; retryButton.className = "secondary-button"; retryButton.textContent = "Retry same request"; retryButton.addEventListener("click", () => retry(record.requestId)); card.append(retryButton); }
        list.append(card);
      });
    } catch (_) { list.textContent = "Unable to read saved request records."; }
  }
  function resetForm() { $("eegCallsAmbajogaiForm").reset(); $("eegCallsAmbajogaiReferredBy").value = "Dr Dahiphale Sir"; $("eegCallsAmbajogaiAgeUnit").value = "years"; $("eegCallsAmbajogaiError").textContent = ""; }
  window.initializeAmbajogaiEegCallsFeature = function () {
    if (!initialized) { initialized = true; $("eegCallsAmbajogaiForm").addEventListener("submit", submit); $("eegCallsAmbajogaiResetButton").addEventListener("click", resetForm); $("eegCallsAmbajogaiPendingRefresh").addEventListener("click", refreshPending); }
    refreshPending();
  };
})();
