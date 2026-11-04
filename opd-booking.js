"use strict";

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
  const alphaCount = (text) => (text.match(/[A-Za-z]/g) || []).length;
  if (alphaCount(values.name) < 3 || !/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(values.name)) errors.push("Enter a valid patient name using English alphabets, periods, slash, and digits 1, 2, or 3 only.");
  const age = Number(values.age);
  if (!Number.isFinite(age) || age <= 0 || age >= 100) errors.push("Age must be greater than 0 and less than 100.");
  if (alphaCount(values.address) < 3 || !/^[A-Za-z]+(?:\s*,?\s+[A-Za-z]+)*$/.test(values.address)) errors.push("Enter a valid address using English alphabets, spaces and comma only.");
  if (!/^[6-9][0-9]{9}$/.test(values.whatsapp)) errors.push("Enter a valid 10-digit WhatsApp number.");
  if (values.patientType === "New") {
    if (!/^[6-9][0-9]{9}$/.test(values.verifyWhatsapp)) errors.push("Enter the WhatsApp number again.");
    else if (values.verifyWhatsapp !== values.whatsapp) errors.push("WhatsApp numbers do not match.");
    const referralMode = document.querySelector('input[name="opdReferralMode"]:checked').value;
    if (referralMode === "doctor" && (alphaCount(values.referredBy) < 3 || !/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(values.referredBy))) errors.push("Enter a valid Doctor / Hospital name using English alphabets only.");
  }
  if (!OPD_CITIES.includes(values.city)) errors.push("Select a valid visiting city.");
  if (!OPD_CITIES.includes(values.nextCity)) errors.push(values.city === "Latur" ? "Select the next follow-up city for this Latur booking." : "Select a valid Next Follow-up City.");
  if (!eligibleOpdCities().includes(values.city)) errors.push("Choose a city scheduled for OPD today or the active Special Access city.");
  if (isVisitCancelled(values.city)) errors.push("Doctor's visit is cancelled today for " + values.city + ".");
  const cash = values.cash === "" ? null : Number(values.cash);
  const online = values.online === "" ? null : Number(values.online);
  if (values.mode === "Cash") {
    if (!Number.isInteger(cash) || cash < 0 || cash > 2000) errors.push("Cash Paid must be between ₹0 and ₹2000.");
  } else if (values.mode === "Online") {
    if (!Number.isInteger(online) || online <= 0 || online > 2000) errors.push("Online Paid must be greater than ₹0 and up to ₹2000.");
  } else if (values.mode === "Split") {
    if (!Number.isInteger(cash) || cash <= 0 || cash > 2000) errors.push("Cash Paid must be greater than ₹0.");
    if (!Number.isInteger(online) || online <= 0 || online > 2000) errors.push("Online Paid must be greater than ₹0.");
    if (Number.isInteger(cash) && Number.isInteger(online) && cash > 0 && online > 0 && cash + online > 2000) errors.push("Total OPD payment cannot exceed ₹2000.");
  }
  return { values, errors, cash, online, age };
}

async function fetchOpdConfiguration() {
  if (!activeUser) return;
  const requestId = "CFG_" + makeRequestId() + makeRequestId();
  const session = activeUser;
  const payload = {
    action: "getAppConfiguration", requestId,
    username: session.username, password: session.password,
    installationId: getInstallationId(), sessionId: session.sessionId || ""
  };
  try {
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify(payload), cache: "no-store", redirect: "follow"
    });
    if (!response.ok) throw new Error("Configuration request failed.");
    const data = await response.json();
    if (data.ok !== true || data.requestId !== requestId || data.action !== "getAppConfiguration") throw new Error("Configuration response could not be verified.");
    const special = data.specialAccess && typeof data.specialAccess === "object" ? data.specialAccess : null;
    const cancellations = data.Doctor_Visit_Cancelled && typeof data.Doctor_Visit_Cancelled === "object" ? data.Doctor_Visit_Cancelled : null;
    opdConfig = { specialAccess: special, doctorVisitCancelled: cancellations };
    updateOpdCityChoices(true);
    updateOpdUpdateCityChoices();
  } catch (error) {
    // The schedule table remains usable. Special Access and cancellation checks
    // cannot be asserted when the authoritative configuration read failed.
    opdConfig = null;
    updateOpdCityChoices(true);
    updateOpdUpdateCityChoices();
    showToast("Could not refresh OPD schedule configuration. Standard schedule only.");
  }
}

function showOpdMutationResult(mutation) {
  const result = document.getElementById("opdResultPanel");
  const pending = document.getElementById("opdPendingPanel");
  const presentation = window.NeuronMutations.presentation(mutation.status);
  pending.hidden = true;
  result.hidden = false;
  result.className = "surface-card opd-result-card status-" + String(mutation.status).toLowerCase();
  const title = document.createElement("h3");
  title.textContent = presentation.label;
  const message = document.createElement("p");
  message.textContent = presentation.message;
  result.replaceChildren(title, message);
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
    if (mutation.status === "UNKNOWN") {
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "secondary-button"; retry.textContent = "Retry same request ID";
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
    if (data.found === true && data.source === "FCM_EVENT" && data.eventType === "OPD_BOOKING" && data.mutationId === mutation.mutationId && data.bookingRequestId === mutation.requestId && data.appointmentId) {
      await window.NeuronMutations.confirm(requestId, data, "HTTP");
    }
    const updated = await window.NeuronMutations.get(requestId);
    showOpdMutationResult(updated || mutation);
    if (data.found !== true) showToast("No queued confirmation event was found. The booking result remains unverified; do not create a new request identity.");
  } catch (_) {
    const updated = await window.NeuronMutations.markUnknown(requestId, "The status check did not return a verifiable result.");
    showOpdMutationResult(updated || mutation);
  }
}

async function submitOpdBooking(event) {
  event.preventDefault();
  if (opdSubmitting) return;
  const validated = validateOpdForm();
  const errorElement = document.getElementById("opdFormError");
  if (validated.errors.length) {
    errorElement.textContent = validated.errors[0];
    showToast("Please correct the OPD booking form.");
    return;
  }
  const { values, cash, online, age } = validated;
  const date = indiaDateParts();
  // Guard against a second local submission for the same patient while an earlier
  // request's result is unresolved. Backend request-ID idempotency remains authoritative.
  try {
    await window.NeuronDataReady;
    const unresolved = (await window.NeuronMutations.list()).filter((item) =>
      item.eventType === "OPD_BOOKING" && ["PENDING", "IN_FLIGHT", "UNKNOWN"].includes(item.status) &&
      item.city === values.city && item.date === date.key && item.payload &&
      String(item.payload.whatsapp || "") === values.whatsapp &&
      String(item.payload.childName || "").trim().toLowerCase().replace(/\s+/g, " ") === values.name.trim().toLowerCase().replace(/\s+/g, " ")
    );
    if (unresolved.length) {
      showOpdMutationResult(unresolved[0]);
      errorElement.textContent = "A matching OPD request is already unresolved. Check its status before submitting again.";
      return;
    }
  } catch (_) {
    errorElement.textContent = "Local request storage is unavailable. The booking was not submitted.";
    return;
  }
  if (document.getElementById("opdAppointmentDate").value !== date.iso) {
    errorElement.textContent = "OPD booking is available only for today's date. No request was sent.";
    return;
  }
  const requestId = makeOpdBookingRequestId();
  const mutationId = window.NeuronMutations.newMutationId ? window.NeuronMutations.newMutationId() : makeRequestId() + "-" + makeRequestId();
  const referralMode = document.querySelector('input[name="opdReferralMode"]:checked').value;
  const referredBy = values.patientType === "New" ? (referralMode === "self" ? "Self" : values.referredBy) : "";
  const total = values.mode === "Cash" ? cash : values.mode === "Online" ? online : cash + online;
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
  opdSubmitting = true;
  const submitButton = document.getElementById("opdSubmitButton");
  submitButton.disabled = true;
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
      if (classified.state === "CONFIRMED") showToast("OPD appointment confirmed by backend response.");
      else showToast("Booking request sent; result needs verification.");
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
    opdSubmitting = false;
    submitButton.disabled = false;
    submitButton.innerHTML = 'Submit OPD booking <span aria-hidden="true">→</span>';
    refreshOpdPendingMutations();
  }
}

async function retryOpdMutation(requestId) {
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
    await window.NeuronMutations.markUnknown(requestId, "The retry result is still uncertain. The same request identity has been retained.");
  }
  showOpdMutationResult(await window.NeuronMutations.get(requestId) || current);
  refreshOpdPendingMutations();
}

async function refreshOpdPendingMutations() {
  if (!window.NeuronStorage || !window.NeuronMutations) return;
  try {
    await window.NeuronDataReady;
    const all = await window.NeuronMutations.list();
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
        const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button"; button.textContent = "Check status";
        button.addEventListener("click", () => checkOpdMutationStatus(item.requestId));
        row.append(text, button); panel.append(row);
      });
    }
  } catch (_) {}
}

function initializeOpdBookingFeature() {
  const form = document.getElementById("opdBookingForm");
  form.addEventListener("submit", submitOpdBooking);
  document.getElementById("opdVisitingCity").addEventListener("change", (event) => {
    const previousCity = opdLastVisitingCity;
    updateNextFollowupCity(event.target.value, false, previousCity);
    opdLastVisitingCity = event.target.value;
    document.getElementById("opdFormError").textContent = "";
  });
  document.getElementById("opdNextFollowupCity").addEventListener("change", () => { opdFollowupManuallyEdited = true; });
  document.getElementById("opdPatientType").addEventListener("change", updatePatientTypeVisibility);
  document.getElementById("opdPaymentMode").addEventListener("change", updateOpdPaymentVisibility);
  document.querySelectorAll('input[name="opdReferralMode"]').forEach((radio) => radio.addEventListener("change", updatePatientTypeVisibility));
  document.getElementById("opdResetButton").addEventListener("click", resetOpdForm);
  document.getElementById("opdBackButton").addEventListener("click", () => setView("home"));
  document.getElementById("opdShowUpdateButton").addEventListener("click", () => showOpdUpdateWorkspace(true));
  document.getElementById("opdBackToBookingButton").addEventListener("click", () => showOpdUpdateWorkspace(false));
  ["opdWhatsapp", "opdVerifyWhatsapp", "opdCashPaid", "opdOnlinePaid"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => { event.target.value = event.target.value.replace(/[^0-9]/g, "").slice(0, id.includes("Whatsapp") ? 10 : 4); });
  });
}

