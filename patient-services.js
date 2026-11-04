/* Patient Services: patient selection, service eligibility, and evidence-tracked refunds. */
(function (root) {
  "use strict";
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  let initialized = false, patients = [], selected = null, loading = false, refundBusy = false;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = value => root.NeuronMutations.money(Number(value || 0));
  function session() { return typeof activeUser !== "undefined" ? activeUser : null; }
  function cityChoices() {
    const user = session() || {};
    if (user.admin === true || root.NeuronCore.normalizeCity(user.city) === "Latur") return CITIES;
    const city = root.NeuronCore.normalizeCity(user.city);
    return city ? [city] : [];
  }
  function todayKey() { return root.NeuronCore.indiaDateKey().replace(/-/g, ""); }
  function status(message, error) { const el = $("servicesStatus"); el.textContent = message; el.classList.toggle("is-error", !!error); }
  function normalizePatient(p) {
    return { ...p, city: root.NeuronCore.normalizeCity(p.city || p.visitingCity), name: String(p.name || p.patientName || "").trim(), appointmentId: String(p.appointmentId || "").trim(), bookingRequestId: String(p.bookingRequestId || p.opdBookingRequestId || p.requestId || "").trim(), rowNumber: Number(p.rowNumber || 0), opdTotalPaid: Number(p.opdTotalPaid ?? (Number(p.opdCashPaid || 0) + Number(p.opdOnlinePaid || 0))), eegTotalPaid: Number(p.eegTotalPaid ?? (Number(p.eegCashPaid || 0) + Number(p.eegOnlinePaid || 0))), opdRefund: Number(p.opdRefund || 0), eegRefund: Number(p.eegRefund || 0) };
  }
  function canOpdRefund(p) { return p.opdTotalPaid > 0 && p.opdRefund <= 0; }
  function hasEeg(p) { return p.eegCharges != null && String(p.eegCharges).trim() !== ""; }
  function canEegRefund(p) { return hasEeg(p) && p.eegTotalPaid > 0 && p.eegRefund <= 0; }
  function renderPatients() {
    const list = $("servicesPatientList"); list.replaceChildren();
    const query = $("servicesSearch").value.trim().toLocaleLowerCase();
    const filtered = patients.filter(p => [p.name, p.appointmentId, p.whatsapp, p.bookingRequestId].some(v => String(v || "").toLocaleLowerCase().includes(query)));
    if (!filtered.length) { const empty = document.createElement("p"); empty.className = "field-hint"; empty.textContent = patients.length ? "No patient matches this search." : "No current-day OPD patients found. Verify the selected city and refresh Today’s OPD."; list.append(empty); return; }
    filtered.forEach(p => {
      const card = document.createElement("button"); card.type = "button"; card.className = "opd-update-patient"; card.setAttribute("aria-pressed", String(selected && selected.bookingRequestId === p.bookingRequestId));
      const name = document.createElement("strong"); name.textContent = p.name || "Patient";
      const meta = document.createElement("small"); meta.textContent = `${p.appointmentId || "Appointment ID unavailable"} · ${p.age || ""} ${p.ageUnit || ""} · ${p.city} · OPD paid ${money(p.opdTotalPaid)}`;
      card.append(name, meta); card.addEventListener("click", () => choosePatient(p)); list.append(card);
    });
  }
  function actionButton(label, detail, handler, disabled) {
    const button = document.createElement("button"); button.type = "button"; button.className = "services-action"; button.disabled = !!disabled;
    const strong = document.createElement("strong"); strong.textContent = label; const small = document.createElement("small"); small.textContent = detail; button.append(strong, small); button.addEventListener("click", handler); return button;
  }
  function choosePatient(p) {
    selected = p; $("servicesSelectedPanel").hidden = false; $("servicesRefundPanel").hidden = true;
    $("servicesSelectedTitle").textContent = p.name || "Selected patient";
    $("servicesSelectedMeta").textContent = [p.appointmentId, p.city, `${p.age || ""} ${p.ageUnit || ""}`.trim(), p.whatsapp ? `WhatsApp ${p.whatsapp}` : ""].filter(Boolean).join(" · ");
    const actions = $("servicesActionList"); actions.replaceChildren();
    actions.append(actionButton("OPD Update", "Edit patient and OPD details", () => { root.setView("opd"); if (typeof root.initializeOpdUpdateFeature === "function") root.initializeOpdUpdateFeature(); if (typeof root.showOpdUpdateWorkspace === "function") root.showOpdUpdateWorkspace(true); }));
    if (hasEeg(p)) actions.append(actionButton("EEG Update", "Edit existing EEG payment and details", () => { root.setView("eeg"); if (typeof root.initializeEegUpdateFeature === "function") root.initializeEegUpdateFeature(); document.getElementById("eegShowUpdateButton")?.click(); }));
    else actions.append(actionButton("EEG Booking", "Book an EEG for this OPD patient", () => { root.setView("eeg"); if (typeof root.initializeEegBookingFeature === "function") root.initializeEegBookingFeature(); }));
    if (canOpdRefund(p) || canEegRefund(p)) actions.append(actionButton("Refund", `OPD eligible ${canOpdRefund(p) ? money(p.opdTotalPaid) : "—"} · EEG eligible ${canEegRefund(p) ? money(p.eegTotalPaid) : "—"}`, openRefund));
    else actions.append(actionButton("Refund", "No refundable OPD/EEG payment remains", () => {}, true));
    renderPatients();
  }
  function openRefund() {
    if (!selected) return;
    $("servicesRefundPanel").hidden = false; $("servicesRefundError").textContent = ""; $("servicesRefundResult").hidden = true;
    $("servicesOpdRefundGroup").hidden = !canOpdRefund(selected); $("servicesEegRefundGroup").hidden = !canEegRefund(selected);
    $("servicesOpdRefund").value = ""; $("servicesEegRefund").value = "";
    $("servicesOpdRefund").max = String(selected.opdTotalPaid); $("servicesEegRefund").max = String(selected.eegTotalPaid);
  }
  async function submitRefund() {
    if (!selected || refundBusy) return;
    const opdText = $("servicesOpdRefund").value.trim(), eegText = $("servicesEegRefund").value.trim();
    const opd = opdText ? Number(opdText) : null, eeg = eegText ? Number(eegText) : null;
    const error = !opdText && !eegText ? "Enter an OPD or EEG refund amount." :
      (opdText && (!Number.isInteger(opd) || opd <= 0 || opd > selected.opdTotalPaid || !canOpdRefund(selected))) ? "Enter a valid OPD refund not exceeding the amount paid." :
      (eegText && (!Number.isInteger(eeg) || eeg <= 0 || eeg > selected.eegTotalPaid || !canEegRefund(selected))) ? "Enter a valid EEG refund not exceeding the amount paid." : "";
    $("servicesRefundError").textContent = error; if (error) return;
    const detail = [`Patient: ${selected.name}`, `Appointment: ${selected.appointmentId}`, opd != null ? `OPD refund: ${money(opd)} (cash)` : "", eeg != null ? `EEG refund: ${money(eeg)} (cash)` : "", `Total: ${money((opd || 0) + (eeg || 0))}`].filter(Boolean).join("\n");
    const approved = await root.NeuronMutations.confirmOperation({ title: "Confirm refund", message: `Process refund for ${selected.name}?`, detail, acceptLabel: "Confirm refund" });
    if (!approved) return;
    refundBusy = true; $("servicesRefundSubmit").disabled = true; $("servicesRefundSubmit").textContent = "Processing…";
    let mutation;
    try {
      const user = session(); if (!user || !user.username || !user.password) throw new Error("Your session is unavailable. Sign in again.");
      const mutationId = root.NeuronMutations.newMutationId();
      const payload = { action: "saveRefund", city: selected.city, bookingRequestId: selected.bookingRequestId, mutationId, sourceInstallationId: typeof getInstallationId === "function" ? getInstallationId() : "", sourceFcmToken: "", opdRefund: opd == null ? "" : opd, eegRefund: eeg == null ? "" : eeg, username: user.username, password: user.password, installationId: typeof getInstallationId === "function" ? getInstallationId() : "", sessionId: user.sessionId || "" };
      const date = todayKey();
      mutation = await root.NeuronMutations.create({ requestId: `WEB_REFUND_${mutationId}`, mutationId, eventType: "REFUND", scope: "statistics", city: selected.city, date, recordId: selected.appointmentId, payload });
      const envelope = await root.NeuronMutations.retryEnvelope(mutation.requestId);
      const response = await root.NeuronCore.request(envelope.payload, 35000); let body = response.body;
      await root.NeuronMutations.classifyTransportResult(mutation.requestId, { ok: !!response.response?.ok }, body);
      mutation = await root.NeuronMutations.get(mutation.requestId);
      const result = $("servicesRefundResult"); result.hidden = false; result.replaceChildren(); root.NeuronMutations.renderStatus(result, mutation, { payment: false });
      if (mutation.status === "CONFIRMED") { status("Refund confirmation received. Refresh patient data to view the updated payment state."); }
      else status("Refund request submitted but its result is not yet verified. Use the same request identity; do not submit a new refund.", true);
    } catch (e) { $("servicesRefundError").textContent = e && e.message || "Unable to process refund."; if (mutation) { await root.NeuronMutations.markUnknown(mutation.requestId, "Refund response could not be verified; retain the same request identity."); const latest = await root.NeuronMutations.get(mutation.requestId); const result = $("servicesRefundResult"); result.hidden = false; result.replaceChildren(); root.NeuronMutations.renderStatus(result, latest, { payment: false }); } }
    finally { refundBusy = false; $("servicesRefundSubmit").disabled = false; $("servicesRefundSubmit").textContent = "Review refund"; }
  }
  async function loadPatients() {
    if (loading) return; loading = true; selected = null; patients = []; $("servicesSelectedPanel").hidden = true; $("servicesRefundPanel").hidden = true; renderPatients();
    const city = $("servicesCity").value, user = session();
    if (!city || !user || !user.username || !user.password) { status("Select an available city and sign in.", true); loading = false; return; }
    status("Loading complete current-day OPD patient snapshot…");
    try {
      const response = await root.NeuronCore.request({ action: "getTodayOPDFromProperties", city, date: todayKey(), username: user.username, password: user.password, installationId: typeof getInstallationId === "function" ? getInstallationId() : "", sessionId: user.sessionId || "" }, 35000);
      const body = response.body;
      if (!response.response.ok || !body || body.ok !== true || body.city !== city || body.date !== todayKey() || body.complete !== true || !Array.isArray(body.patients)) throw new Error(body && body.error || "The patient snapshot is not verified as complete for today and the selected city.");
      patients = body.patients.map(normalizePatient).filter(p => p.bookingRequestId && p.appointmentId && p.name && p.city === city && p.rowNumber >= 2);
      status(`${patients.length} patient(s) loaded from the verified ${city} current-day OPD snapshot.`); renderPatients();
    } catch (e) { status(e && e.message || "Unable to load patients.", true); }
    finally { loading = false; }
  }
  function init() {
    if (initialized) return; initialized = true;
    const select = $("servicesCity"); cityChoices().forEach(city => { const option = document.createElement("option"); option.value = city; option.textContent = city; select.append(option); });
    select.addEventListener("change", loadPatients); $("servicesRefreshButton").addEventListener("click", loadPatients); $("servicesSearch").addEventListener("input", renderPatients);
    $("servicesBackButton").addEventListener("click", () => root.setView("home")); $("servicesRefundSubmit").addEventListener("click", submitRefund); $("servicesRefundCancel").addEventListener("click", () => { $("servicesRefundPanel").hidden = true; });
    if (select.value) loadPatients(); else status("Your account has no configured city access.", true);
  }
  root.initializePatientServicesFeature = init;
})(window);
