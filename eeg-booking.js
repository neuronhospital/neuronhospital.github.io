/* Phase 6.1: EEG booking. Eligibility is derived exclusively from the existing local OPD cache. */
(function () {
  "use strict";
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  let candidates = [];
  let selected = null;
  let initialized = false;
  let submitting = false;

  function indiaDateKey() { return window.NeuronEegCommon.indiaDateKey(); }
  function session() {
    try { return JSON.parse(sessionStorage.getItem("neuronWebsiteSession_v2") || "null"); } catch (_) { return null; }
  }
  function requestId() { return window.NeuronEegCommon.requestId("WEB_EEG_"); }
  function val(id) { return document.getElementById(id).value.trim(); }
  function setMessage(message) { document.getElementById("eegCacheStatus").textContent = message; }
  function cacheData(record) { return record && record.data && typeof record.data === "object" ? record.data : {}; }
  function identity(data) { return String(data.bookingRequestId || data.opdBookingRequestId || data.requestId || "").trim(); }
  function appt(data, record) { return String(data.appointmentId || data.appointmentID || record.recordId || "").trim(); }
  function renderPatients() {
    const list = document.getElementById("eegPatientList"); list.replaceChildren();
    const q = val("eegPatientSearch").toLowerCase();
    const visible = candidates.filter((x) => [x.name, x.appointmentId, x.whatsapp].some((v) => String(v || "").toLowerCase().includes(q)));
    if (!visible.length) {
      const empty = document.createElement("div"); empty.className = "eeg-cache-empty";
      empty.textContent = candidates.length ? "No cached patients match this search." : "No eligible patients are present in this browser’s local OPD cache for today. Refresh/sync OPD data in the website first. EEG eligibility was not requested from the backend.";
      list.append(empty); return;
    }
    visible.forEach((patient) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "opd-update-patient"; button.setAttribute("aria-pressed", String(selected && selected.appointmentId === patient.appointmentId));
      const strong = document.createElement("strong"); strong.textContent = patient.name || "Patient";
      const small = document.createElement("small"); small.textContent = `${patient.appointmentId} · ${patient.age || ""} ${patient.ageUnit || ""} · ${patient.city} · OPD ₹${patient.opdCharges || 0}`;
      button.append(strong, small); button.addEventListener("click", () => { selected = patient; document.getElementById("eegSelectedPatient").textContent = `Selected: ${patient.name} · ${patient.appointmentId}`; document.getElementById("eegSubmitButton").disabled = false; renderPatients(); }); list.append(button);
    });
  }
  async function loadLocalPatients() {
    selected = null; candidates = []; document.getElementById("eegSelectedPatient").textContent = ""; document.getElementById("eegSubmitButton").disabled = true;
    setMessage("Reading today’s OPD records from local IndexedDB…");
    const city = val("eegCity");
    try {
      await window.NeuronDataReady;
      if (!window.NeuronStorage) throw new Error("Local patient cache is unavailable in this browser.");
      const records = await window.NeuronStorage.getRecords({ scope: "opdToday", city, date: indiaDateKey() });
      candidates = records.map((record) => { const d = cacheData(record); return { ...d, appointmentId: appt(d, record), bookingRequestId: identity(d), city: d.city || record.city || city, name: String(d.name || d.patientName || "").trim(), whatsapp: String(d.whatsapp || d.phone || ""), age: d.age, ageUnit: d.ageUnit, opdCharges: Number(d.opdCharges || d.totalOPDCharges || 0), time: d.time || "" }; })
        .filter((x) => x.appointmentId && x.bookingRequestId && x.name && (x.eegCharges === null || x.eegCharges === undefined || String(x.eegCharges).trim() === ""))
        .sort((a, b) => String(b.appointmentId).localeCompare(String(a.appointmentId), undefined, { numeric: true }));
      setMessage(`${records.length} local OPD cache record(s) read; ${candidates.length} eligible patient(s) found for ${city} today. No backend patient-eligibility request was made.`);
    } catch (error) { setMessage(error && error.message ? error.message : "Unable to read local OPD cache."); }
    renderPatients();
  }
  function paymentVisibility() {
    const mode = val("eegPaymentMode");
    document.getElementById("eegCashGroup").hidden = mode === "Online";
    document.getElementById("eegOnlineGroup").hidden = mode === "Cash";
    if (mode === "Cash") document.getElementById("eegOnline").value = "";
    if (mode === "Online") document.getElementById("eegCash").value = "";
  }
  async function submit() {
    const errorEl = document.getElementById("eegBookingError"); errorEl.textContent = "";
    if (submitting || !selected) return;
    const charge = Number(val("eegCharges")); const cash = val("eegCash") === "" ? 0 : Number(val("eegCash")); const online = val("eegOnline") === "" ? 0 : Number(val("eegOnline")); const mode = val("eegPaymentMode");
    if (!Number.isFinite(charge) || charge < 0 || !Number.isFinite(cash) || cash < 0 || !Number.isFinite(online) || online < 0) { errorEl.textContent = "Enter valid non-negative EEG charge and payment amounts."; return; }
    if (Math.abs(cash + online - charge) > 0.001) { errorEl.textContent = "Cash and online payment must total the EEG charges."; return; }
    const user = session(); if (!user || !user.username || !user.password) { errorEl.textContent = "Your session is unavailable. Sign in again."; return; }
    if (!selected.bookingRequestId || !selected.appointmentId) { errorEl.textContent = "The cached patient record is missing its booking identity. Reload the OPD cache; booking was not sent."; return; }
    const mutationId = window.NeuronMutations.newMutationId();
    const payload = { action: "bookEEG", city: selected.city, bookingRequestId: selected.bookingRequestId, mutationId, sourceInstallationId: getInstallationId(), sourceFcmToken: "", eegCharges: charge, eegPaymentMode: mode, eegCashPaid: mode === "Online" ? "" : cash, eegOnlinePaid: mode === "Cash" ? "" : online, username: user.username, password: user.password, installationId: getInstallationId(), sessionId: user.sessionId || "" };
    const req = requestId(); submitting = true; const button = document.getElementById("eegSubmitButton"); button.disabled = true; button.textContent = "Submitting EEG booking…";
    try {
      await window.NeuronDataReady;
      await window.NeuronMutations.create({ requestId: req, mutationId, eventType: "EEG_BOOKING", scope: "opdToday", city: selected.city, date: indiaDateKey(), recordId: selected.bookingRequestId, appointmentId: selected.appointmentId, payload });
      const envelope = await window.NeuronMutations.retryEnvelope(req);
      const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow" });
      let body = null; try { body = await response.json(); } catch (_) {}
      await window.NeuronMutations.classifyTransportResult(req, { ok: response.ok }, body);
      const current = await window.NeuronMutations.get(req);
      const result = document.getElementById("eegBookingResult"); result.hidden = false;
      if (current && current.status === "CONFIRMED") { result.textContent = `EEG booking confirmed for ${selected.name} (${selected.appointmentId}). Charges: ₹${charge}.`; setMessage("Booking confirmed by backend."); await loadLocalPatients(); }
      else { result.textContent = "The booking response could not be confirmed. The same request identity is retained in pending mutations; do not submit a duplicate."; errorEl.textContent = current && current.message || "Booking status is uncertain."; }
    } catch (error) { await window.NeuronMutations.markUnknown(req, "Network response was not received; backend outcome is uncertain.").catch(() => {}); errorEl.textContent = error && error.message || "EEG booking status is uncertain. Do not submit a duplicate."; }
    finally { submitting = false; button.disabled = !selected; button.textContent = "Book EEG"; await refreshRecovery(); }
  }
  async function refreshRecovery() {
    const list = document.getElementById("eegRecoveryList");
    list.replaceChildren();
    try {
      await window.NeuronDataReady;
      const all = await window.NeuronMutations.list();
      const unresolved = (Array.isArray(all) ? all : []).filter((m) => m && m.eventType === "EEG_BOOKING" && ["PENDING", "UNKNOWN", "IN_FLIGHT"].includes(m.status));
      const normalized = [];
      for (const item of unresolved) {
        if (item.status === "IN_FLIGHT") {
          await window.NeuronMutations.recoverStaleInFlight(item.requestId);
          const refreshed = await window.NeuronMutations.get(item.requestId);
          if (refreshed) normalized.push(refreshed);
        } else normalized.push(item);
      }
      const visible = normalized.filter((m) => ["PENDING", "UNKNOWN", "IN_FLIGHT"].includes(m.status));
      if (!visible.length) {
        const empty = document.createElement("p"); empty.className = "field-hint";
        empty.textContent = "No unresolved EEG booking requests are saved in this browser."; list.append(empty); return;
      }
      visible.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).forEach((mutation) => {
        const card = document.createElement("div"); card.className = "opd-pending-item";
        const heading = document.createElement("strong"); heading.textContent = `${mutation.payload && mutation.payload.patientName || mutation.payload && mutation.payload.name || "EEG booking"} · ${mutation.status}`;
        const detail = document.createElement("p"); detail.className = "field-hint";
        detail.textContent = `Request: ${mutation.requestId} · Mutation: ${mutation.mutationId} · ${mutation.errorMessage || "Outcome not yet confirmed"}`;
        if (mutation.status === "IN_FLIGHT") {
          const inProgress = document.createElement("p"); inProgress.className = "field-hint"; inProgress.textContent = "A request attempt is still marked in progress. It will become retryable only after stale-attempt recovery.";
          card.append(heading, detail, inProgress);
        } else {
          const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry same request";
          retry.addEventListener("click", () => retrySavedMutation(mutation.requestId, retry));
          card.append(heading, detail, retry);
        }
        list.append(card);
      });
    } catch (error) {
      const message = document.createElement("p"); message.className = "field-hint";
      message.textContent = error && error.message || "Unable to read saved EEG booking requests."; list.append(message);
    }
  }

  async function retrySavedMutation(savedRequestId, button) {
    if (submitting) return;
    submitting = true; button.disabled = true; button.textContent = "Retrying same request…";
    try {
      const envelope = await window.NeuronMutations.retryEnvelope(savedRequestId);
      const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow" });
      let body = null; try { body = await response.json(); } catch (_) {}
      await window.NeuronMutations.classifyTransportResult(savedRequestId, { ok: response.ok }, body);
      const current = await window.NeuronMutations.get(savedRequestId);
      const result = document.getElementById("eegBookingResult"); result.hidden = false;
      if (current && current.status === "CONFIRMED") {
        result.textContent = `Saved EEG booking request confirmed by backend. Appointment: ${current.appointmentId || "recorded"}.`;
        setMessage("Saved request confirmed. Local cache may update on its next refresh.");
      } else {
        result.textContent = "The retry result is still uncertain. The same saved request identity remains available; do not create a new booking.";
      }
    } catch (error) {
      await window.NeuronMutations.markUnknown(savedRequestId, "Retry transport outcome is uncertain; retain and reuse this same request identity.").catch(() => {});
      const result = document.getElementById("eegBookingResult"); result.hidden = false;
      result.textContent = error && error.message || "Retry result is uncertain. Do not create a duplicate booking.";
    } finally { submitting = false; await refreshRecovery(); }
  }

  function init() {
    if (initialized) return; initialized = true;
    const city = document.getElementById("eegCity");
    const user = session(); const allowed = user && user.admin ? CITIES : [String(user && user.city || "")].filter((x) => CITIES.includes(x));
    (allowed.length ? allowed : CITIES).forEach((name) => { const option = document.createElement("option"); option.value = name; option.textContent = name; city.append(option); });
    city.addEventListener("change", loadLocalPatients); document.getElementById("eegPatientSearch").addEventListener("input", renderPatients); document.getElementById("eegRefreshButton").addEventListener("click", loadLocalPatients); document.getElementById("eegSubmitButton").addEventListener("click", submit); document.getElementById("eegPaymentMode").addEventListener("change", paymentVisibility); document.getElementById("eegBackButton").addEventListener("click", () => setView("home")); document.getElementById("eegRecoveryRefresh").addEventListener("click", refreshRecovery); paymentVisibility(); loadLocalPatients(); refreshRecovery();
  }
  window.initializeEegBookingFeature = init;
})();
