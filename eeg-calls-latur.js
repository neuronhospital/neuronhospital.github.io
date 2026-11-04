"use strict";

(function () {
  const EVENT_TYPE = "EEG_CALLS_BOOKING";
  const CITY = "Latur";
  const $ = (id) => document.getElementById(id);
  let initialized = false;
  let submitting = false;

  function normalizeDigits(value) { return String(value || "").replace(/\D/g, ""); }
  function makeBookingRequestId() { return window.NeuronEegCommon.makeBookingRequestId(); }
  function indiaDateKey() { return window.NeuronEegCommon.indiaDateKey(); }
  function readValues() {
    return {
      patientName: $("eegCallsLaturName").value.trim().replace(/\s+/g, " "),
      age: Number($("eegCallsLaturAge").value), ageUnit: $("eegCallsLaturAgeUnit").value,
      address: $("eegCallsLaturAddress").value.trim().replace(/\s+/g, " "),
      whatsapp: normalizeDigits($("eegCallsLaturWhatsapp").value),
      verifyWhatsapp: normalizeDigits($("eegCallsLaturWhatsappVerify").value),
      referredBy: $("eegCallsLaturReferredBy").value.trim().replace(/\s+/g, " "),
      eegTechnician: $("eegCallsLaturTechnician").value.trim().replace(/\s+/g, " "),
      paymentReceived: Number($("eegCallsLaturPayment").value)
    };
  }
  function validate(values) {
    if (!/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(values.patientName) || (values.patientName.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid patient name using English letters, periods, slash, and digits 1, 2, or 3 only.";
    if (!Number.isFinite(values.age) || values.age <= 0 || values.age >= 100) return "Age must be greater than 0 and less than 100.";
    if (!["years", "months", "days"].includes(values.ageUnit)) return "Select a valid age unit.";
    if (!/^[A-Za-z]+(?:\s*,?\s+[A-Za-z]+)*$/.test(values.address) || (values.address.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid address using English alphabets, spaces and comma only.";
    if (!/^[6-9]\d{9}$/.test(values.whatsapp)) return "Enter a valid 10-digit WhatsApp number.";
    if (!/^[6-9]\d{9}$/.test(values.verifyWhatsapp)) return "Re-enter a valid 10-digit WhatsApp number.";
    if (values.whatsapp !== values.verifyWhatsapp) return "WhatsApp numbers do not match.";
    if (!/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(values.referredBy) || (values.referredBy.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid referral using English alphabets and periods only.";
    if (!/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(values.eegTechnician) || (values.eegTechnician.match(/[A-Za-z]/g) || []).length < 3) return "Enter a valid EEG Technician name using English alphabets only.";
    if (!Number.isInteger(values.paymentReceived) || values.paymentReceived < 0 || values.paymentReceived > 2000) return "Payment received must be between ₹0 and ₹2000.";
    return "";
  }
  function credentials() {
    if (!window.activeUser && typeof activeUser === "undefined") throw new Error("Your session is not available. Please sign in again.");
    const session = typeof activeUser !== "undefined" ? activeUser : window.activeUser;
    if (!session || !(session.admin === true || session.eegcalls === true)) throw new Error("Your account does not have access to Latur EEG Calls.");
    return session;
  }
  function renderResult(mutation) {
    const target = $("eegCallsLaturResult");
    target.hidden = false;
    target.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = mutation.status === "CONFIRMED" ? "EEG Call appointment confirmed" : "EEG Call request saved";
    const message = document.createElement("p");
    message.textContent = window.NeuronMutations.presentation(mutation.status).message;
    target.append(heading, message);
    if (mutation.status === "CONFIRMED") {
      const details = document.createElement("p");
      details.textContent = "Appointment ID: " + mutation.appointmentId + " · Patient: " + mutation.payload.patientName;
      target.append(details);
    } else {
      const id = document.createElement("small"); id.textContent = "Request ID: " + mutation.requestId;
      target.append(id);
    }
  }
  async function postPayload(payload) {
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify(payload), cache: "no-store", redirect: "follow"
    }, 35000);
    let body = null; try { body = await response.json(); } catch (_) {}
    return { response, body };
  }
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const errorEl = $("eegCallsLaturError");
    errorEl.textContent = "";
    let session;
    try { session = credentials(); } catch (error) { errorEl.textContent = error.message; return; }
    const values = readValues();
    const validation = validate(values);
    if (validation) { errorEl.textContent = validation; return; }
    try {
      await window.NeuronDataReady;
      const unresolved = (await window.NeuronMutations.list()).filter((item) => item.eventType === EVENT_TYPE && item.city === CITY && item.date === indiaDateKey() && item.payload && item.payload.whatsapp === values.whatsapp && item.payload.patientName.toLowerCase() === values.patientName.toLowerCase() && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status));
      if (unresolved.length) { renderResult(unresolved[0]); errorEl.textContent = "A matching request is unresolved. Check or retry that saved request before creating another."; return; }
    } catch (_) { errorEl.textContent = "Local mutation storage is unavailable. No request was sent."; return; }

    const requestId = makeBookingRequestId();
    const mutationId = window.NeuronMutations.newMutationId();
    const payload = {
      action: "bookEEGCallsAppointment", bookingRequestId: requestId, mutationId,
      patientName: values.patientName, age: values.age, ageUnit: values.ageUnit, address: values.address,
      whatsapp: values.whatsapp, referredBy: values.referredBy, paymentReceived: values.paymentReceived,
      eegTechnician: values.eegTechnician, sourceInstallationId: getInstallationId(), sourceFcmToken: "",
      username: session.username, password: session.password, installationId: getInstallationId(),
      sessionId: session.sessionId || ""
    };
    const dateKey = indiaDateKey();
    submitting = true;
    const button = $("eegCallsLaturSubmitButton"); button.disabled = true; button.textContent = "Submitting…";
    try {
      const created = await window.NeuronMutations.create({ requestId, mutationId, eventType: EVENT_TYPE, scope: "eegCallsLatur", city: CITY, date: dateKey, payload });
      const envelope = await window.NeuronMutations.retryEnvelope(requestId);
      try {
        const { response, body } = await postPayload(envelope.payload);
        const result = await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
        const current = await window.NeuronMutations.get(requestId);
        renderResult(current || created.mutation);
        if (result.state === "CONFIRMED") {
          $("eegCallsLaturForm").reset(); $("eegCallsLaturTechnician").value = "Sanket Katke"; $("eegCallsLaturPayment").value = "1000"; $("eegCallsLaturAgeUnit").value = "years";
        }
      } catch (_) {
        const unknown = await window.NeuronMutations.markUnknown(requestId, "The transport result is uncertain. Keep the same request identity; do not create a new request.");
        renderResult(unknown || created.mutation);
      }
    } catch (error) {
      errorEl.textContent = error.message || "Unable to persist the booking request.";
      const saved = await window.NeuronMutations.get(requestId).catch(() => null); if (saved) renderResult(saved);
    } finally { submitting = false; button.disabled = false; button.textContent = "Book EEG Call Appointment"; await refreshPending(); }
  }
  async function checkStatus(requestId) {
    const mutation = await window.NeuronMutations.get(requestId); if (!mutation) return;
    const session = credentials();
    try {
      const { body } = await postPayload({ action: "checkEEGCallsBookingRequest", bookingRequestId: mutation.requestId, mutationId: mutation.mutationId, username: session.username, password: session.password, installationId: getInstallationId(), sessionId: session.sessionId || "", sourceInstallationId: getInstallationId(), sourceFcmToken: "" });
      if (body && body.found === true && body.bookingRequestId === mutation.requestId && body.mutationId === mutation.mutationId && body.appointmentId) {
        await window.NeuronMutations.confirm(requestId, { ...body, requestId: mutation.requestId, eventType: EVENT_TYPE, ok: true }, "HTTP");
      }
      const latest = await window.NeuronMutations.get(requestId); if (latest) renderResult(latest);
    } catch (_) { await window.NeuronMutations.markUnknown(requestId, "The status check could not verify the request."); }
    await refreshPending();
  }
  async function retry(requestId) {
    const mutation = await window.NeuronMutations.get(requestId); if (!mutation || !["UNKNOWN", "PENDING"].includes(mutation.status)) return;
    try {
      const envelope = await window.NeuronMutations.retryEnvelope(requestId);
      const { response, body } = await postPayload(envelope.payload);
      await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
    } catch (_) { await window.NeuronMutations.markUnknown(requestId, "Retry outcome remains uncertain. Original request identity retained."); }
    const latest = await window.NeuronMutations.get(requestId); if (latest) renderResult(latest); await refreshPending();
  }
  async function refreshPending() {
    const list = $("eegCallsLaturPendingList");
    try {
      await window.NeuronDataReady;
      const records = (await window.NeuronMutations.list()).filter((item) => item.eventType === EVENT_TYPE && item.city === CITY && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status)).sort((a,b) => b.createdAt - a.createdAt);
      list.replaceChildren();
      if (!records.length) { const p = document.createElement("p"); p.className = "field-hint"; p.textContent = "No unresolved Latur EEG Calls requests."; list.append(p); return; }
      records.forEach((record) => {
        const card = document.createElement("article"); card.className = "eeg-call-pending-item";
        const title = document.createElement("strong"); title.textContent = record.payload.patientName + " · " + window.NeuronMutations.presentation(record.status).label;
        const detail = document.createElement("p"); detail.textContent = "Request ID: " + record.requestId + " · " + window.NeuronMutations.presentation(record.status).message;
        card.append(title, detail);
        const check = document.createElement("button"); check.type = "button"; check.className = "secondary-button"; check.textContent = "Check status"; check.addEventListener("click", () => checkStatus(record.requestId)); card.append(check);
        if (["UNKNOWN", "PENDING"].includes(record.status)) { const retryButton = document.createElement("button"); retryButton.type = "button"; retryButton.className = "secondary-button"; retryButton.textContent = "Retry same request"; retryButton.addEventListener("click", () => retry(record.requestId)); card.append(retryButton); }
        list.append(card);
      });
    } catch (_) { list.textContent = "Unable to read saved request records."; }
  }
  function resetForm() { $("eegCallsLaturForm").reset(); $("eegCallsLaturTechnician").value = "Sanket Katke"; $("eegCallsLaturPayment").value = "1000"; $("eegCallsLaturAgeUnit").value = "years"; $("eegCallsLaturError").textContent = ""; }
  window.initializeLaturEegCallsFeature = function () {
    if (!initialized) {
      initialized = true;
      $("eegCallsLaturForm").addEventListener("submit", submit);
      $("eegCallsLaturResetButton").addEventListener("click", resetForm);
      $("eegCallsLaturPendingRefresh").addEventListener("click", refreshPending);
    }
    refreshPending();
  };
})();
