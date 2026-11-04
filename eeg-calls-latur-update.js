"use strict";

/* Latur EEG Calls Update: synced row identity, immutable mutation envelope, and status-safe recovery. */
(function () {
  const EVENT_TYPE = "EEG_CALLS_UPDATE";
  const CITY = "Latur";
  const CACHE_SCOPE = "eegCalls";
  const CACHE_DATE = "ALL";
  const $ = (id) => document.getElementById(id);
  let initialized = false;
  let records = [];
  let selected = null;
  let loading = false;
  let submitting = false;
  let cacheStale = false;

  function digits(value) { return String(value || "").replace(/\D/g, ""); }
  function indiaDateKey() { return window.NeuronEegCommon.indiaDateKey(); }
  function credentials() {
    const session = typeof activeUser !== "undefined" ? activeUser : window.activeUser;
    if (!session || !(session.admin === true || session.eegcalls === true) || !session.username || !session.password) throw new Error("Your session or Latur EEG Calls permission is unavailable. Please sign in again.");
    return session;
  }
  function requestId(prefix) { return window.NeuronEegCommon.requestId(prefix); }
  async function post(payload, timeoutMs) { return window.NeuronEegCommon.post(payload, timeoutMs); }
  function rowToRecord(row, rowNumber) {
    if (!Array.isArray(row) || row.length < 11 || !Number.isInteger(rowNumber) || rowNumber < 2) return null;
    const appointmentId = String(row[0] || "").trim();
    const bookingRequestId = String(row[10] || "").trim();
    if (!appointmentId || !bookingRequestId) return null;
    const ageText = String(row[4] || "").trim();
    const ageMatch = ageText.match(/^\s*(\d+(?:\.\d+)?)\s*(years?|months?|days?)?\s*$/i);
    const age = ageMatch ? ageMatch[1] : ageText;
    const ageUnit = ageMatch && ageMatch[2] ? ageMatch[2].toLowerCase().replace(/s$/, "") + "s" : "years";
    return {
      appointmentId, rowNumber, date:String(row[1] || "").trim(), time:String(row[2] || "").trim(),
      patientName:String(row[3] || "").trim(), age, ageUnit, address:String(row[5] || "").trim(),
      whatsapp:digits(row[6]), referredBy:String(row[7] || "").trim(), paymentReceived:Number(row[8] || 0),
      eegTechnician:String(row[9] || "").trim(), bookingRequestId, patientRow:row.slice(0,11)
    };
  }
  function toPatientData(item) { return { ...item, patientRow:item.patientRow.slice(0,11) }; }
  async function loadFromCache() {
    await window.NeuronDataReady;
    const sync = await window.NeuronStorage.getSyncState({ scope:CACHE_SCOPE, city:CITY, date:CACHE_DATE });
    if (!sync || !["complete", "stale"].includes(sync.status)) return false;
    cacheStale = sync.status === "stale";
    const cached = await window.NeuronStorage.getRecords({ scope:CACHE_SCOPE, city:CITY, date:CACHE_DATE });
    records = cached.map((entry) => entry.data).filter((entry) => entry && entry.appointmentId && entry.bookingRequestId && Number(entry.rowNumber) >= 2);
    renderPatients();
    return true;
  }
  async function refreshRecords() {
    if (loading) return;
    let session;
    try { session = credentials(); } catch (error) { $("eegCallsLaturUpdateMessage").textContent = error.message; return; }
    loading = true;
    const refresh = $("eegCallsLaturUpdateRefresh"); refresh.disabled = true; refresh.textContent = "Refreshing…";
    $("eegCallsLaturUpdateMessage").textContent = "Loading authoritative Latur EEG Calls records…";
    try {
      const { response, body } = await post({ action:"syncEEGCalls", username:session.username, password:session.password, sessionId:session.sessionId || "", installationId:getInstallationId(), sourceInstallationId:getInstallationId(), sourceFcmToken:"" }, 60000);
      if (!response.ok || !body || body.ok !== true || !Array.isArray(body.patients) || !body.rowNumbers || typeof body.rowNumbers !== "object") throw new Error((body && body.error) || "The EEG Calls sync response is incomplete.");
      const valid = [];
      for (const row of body.patients) {
        if (!Array.isArray(row)) throw new Error("The sync response contains an invalid patient row.");
        const appointmentId = String(row[0] || "").trim();
        const rowNumber = Number(body.rowNumbers[appointmentId]);
        const item = rowToRecord(row, rowNumber);
        if (!item) throw new Error("A sync row is missing a valid appointment ID, booking request ID, or spreadsheet row number. No partial cache was applied.");
        valid.push(item);
      }
      const completedAt = Number(body.updatedAt) > 0 ? Number(body.updatedAt) : Date.now();
      await window.NeuronStorage.replaceSlice({ scope:CACHE_SCOPE, city:CITY, date:CACHE_DATE, records:valid.map((item) => ({ recordId:item.appointmentId, data:toPatientData(item), status:"current", updatedAt:completedAt })), syncVersion:Number.isFinite(Number(body.syncVersion)) ? Number(body.syncVersion) : null, completedAt });
      records = valid;
      cacheStale = false;
      selected = null; $("eegCallsLaturUpdateForm").hidden = true;
      $("eegCallsLaturUpdateMessage").textContent = "Loaded " + records.length + " Latur EEG Calls records. Last refreshed " + new Date(completedAt).toLocaleString("en-IN", { timeZone:"Asia/Kolkata" }) + ".";
      renderPatients();
    } catch (error) {
      await window.NeuronStorage.markSliceStale({ scope:CACHE_SCOPE, city:CITY, date:CACHE_DATE, reason:error.message || "Authoritative refresh failed." }).catch(() => {});
      const cached = await loadFromCache().catch(() => false);
      $("eegCallsLaturUpdateMessage").textContent = cached ? "Refresh failed; showing a STALE local snapshot for reference only. Refresh successfully before selecting or updating a patient. " + (error.message || "") : (error.message || "Unable to load EEG Calls records. No update can be submitted without a complete record.");
    } finally { loading = false; refresh.disabled = false; refresh.textContent = "Refresh records"; }
  }
  function renderPatients() {
    const list = $("eegCallsLaturUpdatePatientList");
    const query = $("eegCallsLaturUpdateSearch").value.trim().toLowerCase();
    list.replaceChildren();
    const matches = records.filter((item) => [item.patientName,item.whatsapp,item.appointmentId,item.bookingRequestId].some((value) => String(value || "").toLowerCase().includes(query)));
    if (!matches.length) {
      const empty = document.createElement("div"); empty.className = "eeg-cache-empty";
      empty.textContent = records.length ? "No Latur EEG Calls records match this search." : "No complete Latur EEG Calls cache is available. Use Refresh records to load it.";
      list.append(empty); return;
    }
    matches.slice(0,250).forEach((item) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "opd-update-patient"; button.setAttribute("aria-pressed", String(!!selected && selected.appointmentId === item.appointmentId));
      const title = document.createElement("strong"); title.textContent = item.patientName + " · " + item.date;
      const detail = document.createElement("span"); detail.textContent = item.whatsapp + " · " + item.appointmentId + " · Paid ₹" + item.paymentReceived;
      button.append(title, detail); button.addEventListener("click", () => choosePatient(item)); list.append(button);
    });
    if (matches.length > 250) { const hint = document.createElement("p"); hint.className = "field-hint"; hint.textContent = "Showing the first 250 matching records. Refine the search to find a specific patient."; list.append(hint); }
  }
  function choosePatient(item) {
    if (cacheStale) { $("eegCallsLaturUpdateError").textContent = "This cached list is stale. Refresh records successfully before editing a patient."; return; }
    selected = item;
    $("eegCallsLaturUpdateName").value = item.patientName;
    $("eegCallsLaturUpdateAge").value = item.age;
    $("eegCallsLaturUpdateAgeUnit").value = ["years","months","days"].includes(item.ageUnit) ? item.ageUnit : "years";
    $("eegCallsLaturUpdateWhatsapp").value = item.whatsapp;
    $("eegCallsLaturUpdateReferral").value = item.referredBy;
    $("eegCallsLaturUpdatePayment").value = String(Math.trunc(item.paymentReceived));
    $("eegCallsLaturUpdateAddress").value = item.address;
    $("eegCallsLaturUpdateSelectedHeading").textContent = "Edit " + item.patientName + " · " + item.appointmentId;
    $("eegCallsLaturUpdateError").textContent = ""; $("eegCallsLaturUpdateForm").hidden = false;
    renderPatients();
  }
  function validate(values) {
    if (!/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(values.patientName) || (values.patientName.match(/[A-Za-z]/g)||[]).length < 3) return "Enter a valid patient name using English alphabets, periods, slash, and digits 1, 2, or 3 only.";
    if (!Number.isFinite(values.age) || values.age <= 0 || values.age >= 100 || !["years","months","days"].includes(values.ageUnit)) return "Enter a valid age and age unit.";
    if (!/^[A-Za-z]+(?:\s*,?\s+[A-Za-z]+)*$/.test(values.address) || (values.address.match(/[A-Za-z]/g)||[]).length < 3) return "Enter a valid address using English alphabets, spaces and comma only.";
    if (!/^[6-9]\d{9}$/.test(values.whatsapp)) return "Enter a valid 10-digit WhatsApp number.";
    if (!/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(values.referredBy) || (values.referredBy.match(/[A-Za-z]/g)||[]).length < 3) return "Enter a valid referral using English alphabets and periods only.";
    if (!Number.isInteger(values.paymentReceived) || values.paymentReceived < 0 || values.paymentReceived > 99999999) return "Enter a valid non-negative payment amount.";
    return "";
  }
  function values() {
    return { patientName:$("eegCallsLaturUpdateName").value.trim().replace(/\s+/g," "), age:Number($("eegCallsLaturUpdateAge").value), ageUnit:$("eegCallsLaturUpdateAgeUnit").value, whatsapp:digits($("eegCallsLaturUpdateWhatsapp").value), referredBy:$("eegCallsLaturUpdateReferral").value.trim().replace(/\s+/g," "), paymentReceived:Number($("eegCallsLaturUpdatePayment").value), address:$("eegCallsLaturUpdateAddress").value.trim().replace(/\s+/g," ") };
  }
  function normalizeAge(value, unit) { return String(Number(value)) + " " + unit; }
  async function submitUpdate(event) {
    event.preventDefault(); if (submitting || !selected) return;
    let session; try { session = credentials(); } catch (error) { $("eegCallsLaturUpdateError").textContent = error.message; return; }
    const form = values(); const issue = validate(form); if (issue) { $("eegCallsLaturUpdateError").textContent = issue; return; }
    const originalAge = String(selected.age).trim();
    const changed = form.patientName !== selected.patientName || normalizeAge(form.age,form.ageUnit) !== (originalAge.includes(" ") ? originalAge : normalizeAge(selected.age,selected.ageUnit)) || form.address !== selected.address || form.whatsapp !== selected.whatsapp || form.referredBy !== selected.referredBy || form.paymentReceived !== Number(selected.paymentReceived);
    if (!changed) { $("eegCallsLaturUpdateError").textContent = "No changes detected. Modify at least one field before saving."; return; }
    const unresolved = (await window.NeuronMutations.list()).filter((m) => m.eventType === EVENT_TYPE && m.city === CITY && m.recordId === selected.appointmentId && ["PENDING","IN_FLIGHT","UNKNOWN"].includes(m.status));
    if (unresolved.length) { $("eegCallsLaturUpdateError").textContent = "An update for this appointment is unresolved. Check or retry the saved request first."; await refreshPending(); return; }
    const localRequestId = requestId("ECU_"); const mutationId = window.NeuronMutations.newMutationId();
    const row = [selected.appointmentId, selected.date, selected.time, form.patientName, form.age + " " + form.ageUnit, form.address, form.whatsapp, form.referredBy, form.paymentReceived, selected.eegTechnician, selected.bookingRequestId];
    const payload = { action:"updateEEGCallsPatientDetails", rowNumber:selected.rowNumber, appointmentId:selected.appointmentId, bookingRequestId:selected.bookingRequestId, patientName:form.patientName, age:form.age, ageUnit:form.ageUnit, address:form.address, whatsapp:form.whatsapp, referredBy:form.referredBy, paymentReceived:form.paymentReceived, eegTechnician:selected.eegTechnician, patientRow:JSON.stringify(row), mutationId, sourceInstallationId:getInstallationId(), sourceFcmToken:"", username:session.username, password:session.password, installationId:getInstallationId(), sessionId:session.sessionId || "" };
    submitting = true; const button = $("eegCallsLaturUpdateSubmit"); button.disabled = true; button.textContent = "Saving…";
    try {
      await window.NeuronDataReady;
      await window.NeuronMutations.create({ requestId:localRequestId, mutationId, eventType:EVENT_TYPE, scope:CACHE_SCOPE, city:CITY, date:indiaDateKey(), recordId:selected.appointmentId, payload });
      const envelope = await window.NeuronMutations.retryEnvelope(localRequestId);
      try {
        const { response, body } = await post(envelope.payload,35000);
        const outcome = await window.NeuronMutations.classifyTransportResult(localRequestId,{ok:response.ok},body);
        const saved = await window.NeuronMutations.get(localRequestId);
        if (outcome.state === "CONFIRMED") {
          const updated = { ...selected, ...form, age:String(form.age), ageUnit:form.ageUnit, patientRow:row, updatedAt:Date.now() };
          const idx = records.findIndex((item) => item.appointmentId === selected.appointmentId); if (idx >= 0) records[idx] = updated;
          await window.NeuronStorage.putRecord({ scope:CACHE_SCOPE, city:CITY, date:CACHE_DATE, recordId:updated.appointmentId, data:toPatientData(updated), status:"current", updatedAt:Date.now() });
          $("eegCallsLaturUpdateMessage").textContent = "Update confirmed. The local cache reflects the confirmed details.";
          $("eegCallsLaturUpdateForm").hidden = true; selected = null; renderPatients();
        } else { $("eegCallsLaturUpdateError").textContent = window.NeuronMutations.presentation(saved.status).message + " Request ID: " + localRequestId; }
      } catch (_) { const unknown = await window.NeuronMutations.markUnknown(localRequestId,"The update result is uncertain. Keep the original request and mutation identity for recovery."); $("eegCallsLaturUpdateError").textContent = window.NeuronMutations.presentation(unknown.status).message + " Request ID: " + localRequestId; }
    } catch (error) { $("eegCallsLaturUpdateError").textContent = error.message || "Unable to save the update."; }
    finally { submitting = false; button.disabled = false; button.textContent = "Save EEG Call update"; await refreshPending(); }
  }
  async function checkStatus(id) {
    const mutation = await window.NeuronMutations.get(id); if (!mutation) return;
    const session = credentials();
    try {
      const { body } = await post({ action:"checkMutationStatus", eventType:EVENT_TYPE, mutationId:mutation.mutationId, bookingRequestId:mutation.payload.bookingRequestId, appointmentId:mutation.payload.appointmentId, city:CITY, recovery:true, username:session.username, password:session.password, sessionId:session.sessionId || "", installationId:getInstallationId(), sourceInstallationId:getInstallationId(), sourceFcmToken:"" },25000);
      const status = String(body && (body.status || body.outcome || "")).toUpperCase();
      const identityOk = body && body.mutationId === mutation.mutationId && (body.bookingRequestId === mutation.payload.bookingRequestId || body.requestId === mutation.requestId) && (!body.eventType || body.eventType === EVENT_TYPE);
      if (body && body.ok === true && identityOk && ["CONFIRMED","SUCCESS","OK"].includes(status)) {
        await window.NeuronMutations.confirm(id,{...body,requestId:mutation.requestId,mutationId:mutation.mutationId,eventType:EVENT_TYPE,ok:true},"HTTP");
      } else if (body && body.definitive === true && status === "FAILED" && identityOk) {
        await window.NeuronMutations.markDefinitiveFailure(id,{...body,requestId:mutation.requestId,mutationId:mutation.mutationId,eventType:EVENT_TYPE});
      } else { await window.NeuronMutations.markUnknown(id,"Status response did not contain matching, conclusive mutation evidence."); }
    } catch (_) { await window.NeuronMutations.markUnknown(id,"Status check could not verify the update."); }
    await refreshPending();
  }
  async function retry(id) {
    const mutation = await window.NeuronMutations.get(id); if (!mutation || !["PENDING","UNKNOWN"].includes(mutation.status)) return;
    try { const envelope = await window.NeuronMutations.retryEnvelope(id); const {response,body}=await post(envelope.payload,35000); await window.NeuronMutations.classifyTransportResult(id,{ok:response.ok},body); }
    catch (_) { await window.NeuronMutations.markUnknown(id,"Retry outcome remains uncertain. Original mutation and payload retained."); }
    await refreshPending();
  }
  async function refreshPending() {
    const list = $("eegCallsLaturUpdatePendingList");
    try {
      await window.NeuronDataReady;
      const items = (await window.NeuronMutations.list()).filter((m)=>m.eventType===EVENT_TYPE&&m.city===CITY&&["PENDING","IN_FLIGHT","UNKNOWN"].includes(m.status)).sort((a,b)=>b.createdAt-a.createdAt);
      list.replaceChildren();
      if (!items.length) { const p=document.createElement("p");p.className="field-hint";p.textContent="No unresolved Latur EEG Calls updates.";list.append(p);return; }
      items.forEach((m)=>{ const card=document.createElement("article");card.className="eeg-call-pending-item";const title=document.createElement("strong");title.textContent=m.payload.patientName+" · "+window.NeuronMutations.presentation(m.status).label;const detail=document.createElement("p");detail.textContent="Appointment: "+m.payload.appointmentId+" · Request: "+m.requestId;card.append(title,detail);const check=document.createElement("button");check.type="button";check.className="secondary-button";check.textContent="Check status";check.addEventListener("click",()=>checkStatus(m.requestId));card.append(check);if(["PENDING","UNKNOWN"].includes(m.status)){const again=document.createElement("button");again.type="button";again.className="secondary-button";again.textContent="Retry same update";again.addEventListener("click",()=>retry(m.requestId));card.append(again);}list.append(card); });
    } catch (_) { list.textContent="Unable to read saved update requests."; }
  }
  function switchMode(update) {
    $("eegCallsLaturBookingWorkspace").hidden=update; $("eegCallsLaturUpdateWorkspace").hidden=!update;
    $("eegCallsLaturBookingTab").setAttribute("aria-pressed",String(!update)); $("eegCallsLaturUpdateTab").setAttribute("aria-pressed",String(update));
    $("eegCallsLaturBookingTab").className=update?"secondary-button":"primary-button"; $("eegCallsLaturUpdateTab").className=update?"primary-button":"secondary-button";
    if (update && !records.length) refreshRecords();
  }
  window.initializeLaturEegCallsUpdateFeature = function () {
    if (!initialized) {
      initialized=true;
      $("eegCallsLaturBookingTab").addEventListener("click",()=>switchMode(false)); $("eegCallsLaturUpdateTab").addEventListener("click",()=>switchMode(true));
      $("eegCallsLaturUpdateRefresh").addEventListener("click",refreshRecords); $("eegCallsLaturUpdateSearch").addEventListener("input",renderPatients);
      $("eegCallsLaturUpdateForm").addEventListener("submit",submitUpdate); $("eegCallsLaturUpdateCancel").addEventListener("click",()=>{selected=null;$("eegCallsLaturUpdateForm").hidden=true;renderPatients();});
      $("eegCallsLaturUpdatePendingRefresh").addEventListener("click",refreshPending);
    }
    refreshPending();
  };
})();
