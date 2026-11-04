"use strict";
/* Ambajogai EEG Calls Update: dedicated schema, exact row identity, and mutation recovery. */
(function () {
  const EVENT_TYPE = "AMB_EEG_CALLS_UPDATE", CITY = "Ambajogai EEG Calls", SCOPE = "eegCallsAmbajogai", DATE = "ALL";
  const $ = (id) => document.getElementById(id);
  let initialized = false, records = [], selected = null, loading = false, submitting = false, cacheStale = false;
  function credentials() { const s = typeof activeUser !== "undefined" ? activeUser : window.activeUser; if (!s || !(s.admin === true || s.eegcalls === true) || !s.username || !s.password) throw new Error("Your session or Ambajogai EEG Calls permission is unavailable. Sign in again."); return s; }
  function indiaDateKey() { return window.NeuronEegCommon.indiaDateKey(); }
  function requestId() { return window.NeuronEegCommon.requestId("AMBUP_"); }
  async function post(payload, timeout=35000) { return window.NeuronEegCommon.post(payload, timeout); }
  function rowToRecord(row,rowNumber) { if(!Array.isArray(row)||row.length<8||!Number.isInteger(rowNumber)||rowNumber<2)return null; const appointmentId=String(row[0]||"").trim(),bookingRequestId=String(row[7]||"").trim(); if(!appointmentId||! /^[A-Z]{8}$/.test(bookingRequestId))return null; const ageText=String(row[4]||"").trim(),m=ageText.match(/^\s*(\d+(?:\.\d+)?)\s*(years?|months?|days?)?\s*$/i); return {appointmentId,bookingRequestId,rowNumber,date:String(row[1]||"").trim(),time:String(row[2]||"").trim(),patientName:String(row[3]||"").trim(),age:m?m[1]:ageText,ageUnit:m&&m[2]?m[2].toLowerCase().replace(/s$/,"s"):"years",referredBy:String(row[5]||"").trim(),eegTechnician:String(row[6]||"").trim(),patientRow:row.slice(0,8)}; }
  async function cacheRead() {
    await window.NeuronDataReady;
    const state = await window.NeuronStorage.getSyncState({ scope: SCOPE, city: CITY, date: DATE });
    if (!state || !["complete", "stale"].includes(state.status)) return false;
    cacheStale = state.status === "stale";
    const stored = await window.NeuronStorage.getRecords({ scope: SCOPE, city: CITY, date: DATE });
    records = stored.map(item => item.data).filter(item => item && item.appointmentId && item.bookingRequestId && Number(item.rowNumber) >= 2);
    render();
    return true;
  }
  function validateSyncSnapshot(body) {
    if (!body || body.ok !== true || !Array.isArray(body.patients) || !body.rowNumbers || typeof body.rowNumbers !== "object") throw new Error("The Ambajogai sync response is incomplete.");
    for (const key of ["syncVersion", "lastSerial", "lastRowNumber", "updatedAt"]) {
      if (!Number.isSafeInteger(Number(body[key])) || Number(body[key]) < 0) throw new Error("The Ambajogai sync response has invalid authoritative metadata: " + key + ".");
    }
    if (Number(body.lastRowNumber) < 1 || Number(body.updatedAt) <= 0) throw new Error("The Ambajogai sync response has invalid row boundary or timestamp.");
    const keys = Object.keys(body.rowNumbers);
    if (keys.length !== body.patients.length) throw new Error("The Ambajogai row-number map does not match the patient count.");
    const appointmentIds = new Set(), requestIds = new Set(), rowNums = new Set(), serials = new Set();
    const valid = [];
    for (const row of body.patients) {
      if (!Array.isArray(row) || row.length !== 8) throw new Error("An Ambajogai patient row has an invalid column count.");
      const appointmentId = String(row[0] || "").trim(), date = String(row[1] || "").trim(), requestId = String(row[7] || "").trim();
      const rowNumber = Number(body.rowNumbers[appointmentId]);
      const match = /^AEC-(\d{6})-(\d+)$/.exec(appointmentId);
      const serial = match ? Number(match[2]) : NaN;
      if (!appointmentId || !match || match[1] !== date.slice(2) || !Number.isSafeInteger(serial) || serial < 1 || serial > Number(body.lastSerial)) throw new Error("An Ambajogai appointment ID has an invalid date or serial.");
      if (!/^\d{8}$/.test(date) || !/^([A-Z]{8})$/.test(requestId)) throw new Error("An Ambajogai row has an invalid date or booking-request ID.");
      const yyyy = Number(date.slice(0,4)), mm = Number(date.slice(4,6)), dd = Number(date.slice(6,8));
      const check = new Date(Date.UTC(yyyy, mm-1, dd));
      if (check.getUTCFullYear() !== yyyy || check.getUTCMonth() !== mm-1 || check.getUTCDate() !== dd) throw new Error("An Ambajogai row has an invalid calendar date.");
      if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || rowNumber > Number(body.lastRowNumber)) throw new Error("An Ambajogai row has an invalid spreadsheet row number.");
      if (appointmentIds.has(appointmentId) || requestIds.has(requestId) || rowNums.has(rowNumber) || serials.has(serial)) throw new Error("Duplicate appointment, request, row, or serial identity found in Ambajogai sync data.");
      appointmentIds.add(appointmentId); requestIds.add(requestId); rowNums.add(rowNumber); serials.add(serial);
      const item = rowToRecord(row, rowNumber);
      if (!item) throw new Error("An Ambajogai patient row failed identity validation.");
      item.serial = serial;
      valid.push(item);
    }
    return valid;
  }
  async function backgroundCheck() {
    if (loading || document.visibilityState === "hidden") return;
    let session;
    try { session = credentials(); } catch (_) { return; }
    try {
      const { response, body } = await post({ action: "getAmbajogaiEEGCallsSyncState", username: session.username, password: session.password, sessionId: session.sessionId || "", installationId: getInstallationId(), sourceInstallationId: getInstallationId(), sourceFcmToken: "" }, 12000);
      if (!response.ok || !body || body.ok !== true || !Number.isSafeInteger(Number(body.syncVersion))) throw new Error("Unable to read Ambajogai server sync state.");
      const local = await window.NeuronStorage.getSyncState({ scope: SCOPE, city: CITY, date: DATE });
      const storedRecords = await window.NeuronStorage.getRecords({ scope: SCOPE, city: CITY, date: DATE });
      const invalidIdentity = storedRecords.some(record => !record.data || !record.data.appointmentId || !record.data.bookingRequestId || !Number.isInteger(Number(record.data.rowNumber)) || Number(record.data.rowNumber) < 2);
      if (invalidIdentity || !local || local.status !== "complete" || Number(local.syncVersion) !== Number(body.syncVersion)) {
        await refresh();
      }
    } catch (error) {
      const prior = await window.NeuronStorage.getSyncState({ scope: SCOPE, city: CITY, date: DATE }).catch(() => null);
      if (prior) await window.NeuronStorage.markSliceStale({ scope: SCOPE, city: CITY, date: DATE, reason: error.message || "Ambajogai server state check failed." }).catch(() => {});
      cacheStale = true;
      render();
      $("eegCallsAmbajogaiUpdateMessage").textContent = "Unable to verify Ambajogai data freshness. Cached records are stale until a successful refresh.";
    }
  }
  async function refresh() {
    if (loading) return;
    let session;
    try { session = credentials(); } catch (error) { $("eegCallsAmbajogaiUpdateMessage").textContent = error.message; return; }
    loading = true;
    const button = $("eegCallsAmbajogaiUpdateRefresh");
    button.disabled = true; button.textContent = "Refreshing…";
    $("eegCallsAmbajogaiUpdateMessage").textContent = "Loading authoritative Ambajogai EEG Calls records…";
    // Mark the last good snapshot stale before the network request. If the tab
    // closes or is suspended mid-request, the next load cannot treat it as fresh.
    await window.NeuronStorage.markSliceStale({ scope: SCOPE, city: CITY, date: DATE, reason: "Authoritative sync in progress; completion not yet confirmed." }).catch(() => {});
    cacheStale = true; render();
    try {
      const request = () => post({ action: "syncAmbajogaiEEGCalls", username: session.username, password: session.password, sessionId: session.sessionId || "", installationId: getInstallationId(), sourceInstallationId: getInstallationId(), sourceFcmToken: "" }, 60000);
      const coordinated = window.NeuronSyncCoordinator ? await window.NeuronSyncCoordinator.run("eegCalls:Ambajogai:all", request, { waitForLeaseMs: 20000 }) : { status:"SUCCESS", result:await request() };
      if (coordinated.status !== "SUCCESS" || !coordinated.result) throw new Error("Ambajogai EEG Calls sync is active in another tab. Retry shortly.");
      const { response, body } = coordinated.result;
      if (!response.ok) throw new Error(body && body.error || "Ambajogai synchronization request failed.");
      const valid = validateSyncSnapshot(body);
      const completedAt = Number(body.updatedAt);
      await window.NeuronStorage.replaceSlice({
        scope: SCOPE, city: CITY, date: DATE,
        records: valid.map(item => ({ recordId: item.appointmentId, data: item, status: "current", updatedAt: completedAt })),
        syncVersion: Number(body.syncVersion), lastSerial: Number(body.lastSerial), lastRowNumber: Number(body.lastRowNumber), completedAt
      });
      records = valid; cacheStale = false; selected = null;
      $("eegCallsAmbajogaiUpdateForm").hidden = true;
      $("eegCallsAmbajogaiUpdateMessage").textContent = `Loaded ${records.length} Ambajogai records · Server serial ${body.lastSerial} · Last refreshed ${new Date(completedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`;
      render();
    } catch (error) {
      await window.NeuronStorage.markSliceStale({ scope: SCOPE, city: CITY, date: DATE, reason: error.message || "Authoritative refresh failed." }).catch(() => {});
      const cached = await cacheRead().catch(() => false);
      cacheStale = true;
      $("eegCallsAmbajogaiUpdateMessage").textContent = cached ? "Refresh failed; showing a STALE local snapshot for reference only. Refresh successfully before selecting or updating a patient. " + (error.message || "") : (error.message || "Unable to load records; update submission requires a complete record.");
      render();
    } finally { loading = false; button.disabled = false; button.textContent = "Refresh records"; }
  }
  function render(){const list=$("eegCallsAmbajogaiUpdatePatientList"),q=$("eegCallsAmbajogaiUpdateSearch").value.trim().toLowerCase();list.replaceChildren();const month=indiaDateKey().slice(0,6),eligible=records.filter(x=>String(x.date||"").slice(0,6)===month),found=eligible.filter(x=>[x.patientName,x.appointmentId,x.bookingRequestId,x.date].some(v=>String(v||"").toLowerCase().includes(q)));if(!found.length){const e=document.createElement("div");e.className="eeg-cache-empty";e.textContent=!records.length?"No complete Ambajogai cache. Use Refresh records.":!eligible.length?"No Ambajogai EEG Calls records are eligible for update in the current month.":"No current-month Ambajogai records match this search.";list.append(e);return;}found.slice(0,250).forEach(x=>{const b=document.createElement("button");b.type="button";b.className="opd-update-patient";b.setAttribute("aria-pressed",String(!!selected&&selected.appointmentId===x.appointmentId));const t=document.createElement("strong"),d=document.createElement("span");t.textContent=x.patientName+" · "+x.date;d.textContent=x.appointmentId+" · "+x.bookingRequestId;b.append(t,d);b.addEventListener("click",()=>choose(x));list.append(b);});}
  function choose(x){if(cacheStale){$("eegCallsAmbajogaiUpdateError").textContent="This cached list is stale. Refresh records successfully before editing a patient.";return;}selected=x;$("eegCallsAmbajogaiUpdateName").value=x.patientName;$("eegCallsAmbajogaiUpdateAge").value=x.age;$("eegCallsAmbajogaiUpdateAgeUnit").value=["years","months","days"].includes(x.ageUnit)?x.ageUnit:"years";$("eegCallsAmbajogaiUpdateReferral").value=x.referredBy;$("eegCallsAmbajogaiUpdateTechnician").value=x.eegTechnician;$("eegCallsAmbajogaiUpdateSelectedHeading").textContent="Edit "+x.patientName+" · "+x.appointmentId;$("eegCallsAmbajogaiUpdateError").textContent="";$("eegCallsAmbajogaiUpdateForm").hidden=false;render();}
  function values(){return {patientName:$("eegCallsAmbajogaiUpdateName").value.trim().replace(/\s+/g," "),age:Number($("eegCallsAmbajogaiUpdateAge").value),ageUnit:$("eegCallsAmbajogaiUpdateAgeUnit").value,referredBy:$("eegCallsAmbajogaiUpdateReferral").value.trim().replace(/\s+/g," ")||"Dr Dahiphale Sir",eegTechnician:$("eegCallsAmbajogaiUpdateTechnician").value.trim().replace(/\s+/g," ")};}
  function ageNumber(value){const n=Number(value);return Number.isFinite(n)?(Number.isInteger(n)?String(n):String(Number(n.toFixed(3)))):"";}
  function normalizedAge(value,unit){return ageNumber(value)+" "+String(unit||"years").toLowerCase();}
  function validate(v){if(!/^[A-Za-z.123/]+(?:\s+[A-Za-z.123/]+)*$/.test(v.patientName)||(v.patientName.match(/[A-Za-z]/g)||[]).length<3)return "Enter a valid patient name using English alphabets, periods, slash, and digits 1, 2, or 3 only.";if(!Number.isFinite(v.age)||v.age<=0||v.age>120||!["years","months","days"].includes(v.ageUnit))return "Enter a valid age greater than 0 and not above 120, with a valid unit.";if(!/^[A-Za-z.]+(?:\s+[A-Za-z.]+)*$/.test(v.referredBy)||(v.referredBy.match(/[A-Za-z]/g)||[]).length<3)return "Enter a valid referral.";if(!/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(v.eegTechnician)||(v.eegTechnician.match(/[A-Za-z]/g)||[]).length<3)return "Enter a valid technician name.";return "";}
  async function submit(e){e.preventDefault();if(submitting||!selected)return;let s;try{s=credentials();}catch(x){$("eegCallsAmbajogaiUpdateError").textContent=x.message;return;}if(cacheStale){$("eegCallsAmbajogaiUpdateError").textContent="This patient list is stale. Refresh records successfully before submitting an update.";return;}const v=values(),err=validate(v);if(err){$("eegCallsAmbajogaiUpdateError").textContent=err;return;}const ageText=normalizedAge(v.age,v.ageUnit),oldAge=normalizedAge(selected.age,selected.ageUnit);if(v.patientName===selected.patientName&&ageText===oldAge&&v.referredBy===selected.referredBy&&v.eegTechnician===selected.eegTechnician){$("eegCallsAmbajogaiUpdateError").textContent="No changes detected.";return;}await window.NeuronDataReady;const pending=(await window.NeuronMutations.list()).filter(m=>m.eventType===EVENT_TYPE&&m.city===CITY&&m.recordId===selected.appointmentId&&["PENDING","IN_FLIGHT","UNKNOWN"].includes(m.status));if(pending.length){$("eegCallsAmbajogaiUpdateError").textContent="An update for this appointment is unresolved. Check or retry that saved request first.";await pendingRefresh();return;}
    const rid=requestId(),mid=window.NeuronMutations.newMutationId(),row=[selected.appointmentId,selected.date,selected.time,v.patientName,ageText,v.referredBy,v.eegTechnician,selected.bookingRequestId],payload={action:"updateAmbajogaiEEGCallsPatientDetails",appointmentId:selected.appointmentId,bookingRequestId:selected.bookingRequestId,rowNumber:selected.rowNumber,patientName:v.patientName,age:v.age,ageUnit:v.ageUnit,referredBy:v.referredBy,eegTechnician:v.eegTechnician,mutationId:mid,sourceInstallationId:getInstallationId(),sourceFcmToken:"",installationId:getInstallationId(),username:s.username,password:s.password,sessionId:s.sessionId||"",city:CITY,patientRow:JSON.stringify(row)};
    submitting=true;const b=$("eegCallsAmbajogaiUpdateSubmit");b.disabled=true;b.textContent="Saving…";try{await window.NeuronMutations.create({requestId:rid,mutationId:mid,eventType:EVENT_TYPE,scope:SCOPE,city:CITY,date:indiaDateKey(),recordId:selected.appointmentId,payload});const envelope=await window.NeuronMutations.retryEnvelope(rid);try{const {response,body}=await post(envelope.payload,35000);const result=await window.NeuronMutations.classifyTransportResult(rid,{ok:response.ok},body);const current=await window.NeuronMutations.get(rid);if(result.state==="CONFIRMED"||current.status==="CONFIRMED"){$("eegCallsAmbajogaiUpdateMessage").textContent="Update confirmed. Refreshing authoritative records…";$("eegCallsAmbajogaiUpdateForm").hidden=true;selected=null;await refresh();}else{$("eegCallsAmbajogaiUpdateError").textContent=window.NeuronMutations.presentation(current.status).message+" Request ID: "+rid;}}catch(_){const u=await window.NeuronMutations.markUnknown(rid,"Update result uncertain; preserve the same mutation identity and payload for recovery.");$("eegCallsAmbajogaiUpdateError").textContent=window.NeuronMutations.presentation(u.status).message+" Request ID: "+rid;}}catch(x){$("eegCallsAmbajogaiUpdateError").textContent=x.message||"Unable to persist update request.";}finally{submitting=false;b.disabled=false;b.textContent="Save Ambajogai update";await pendingRefresh();}}
  async function status(id){const m=await window.NeuronMutations.get(id);if(!m)return;const s=credentials();try{const {body}=await post({action:"checkMutationStatus",eventType:EVENT_TYPE,mutationId:m.mutationId,bookingRequestId:m.payload.bookingRequestId,appointmentId:m.payload.appointmentId,city:CITY,recovery:true,username:s.username,password:s.password,sessionId:s.sessionId||"",installationId:getInstallationId(),sourceInstallationId:getInstallationId(),sourceFcmToken:""},25000);const st=String(body&&(body.status||body.outcome||"")).toUpperCase(),ok=body&&body.mutationId===m.mutationId&&(body.bookingRequestId===m.payload.bookingRequestId||body.requestId===m.requestId)&&(!body.eventType||body.eventType===EVENT_TYPE);if(body&&body.ok===true&&ok&&["CONFIRMED","SUCCESS","OK","COMMITTED"].includes(st))await window.NeuronMutations.confirm(id,{...body,requestId:m.requestId,mutationId:m.mutationId,eventType:EVENT_TYPE,ok:true},"HTTP");else if(body&&body.definitive===true&&st==="FAILED"&&ok)await window.NeuronMutations.markDefinitiveFailure(id,{...body,requestId:m.requestId,mutationId:m.mutationId,eventType:EVENT_TYPE});else await window.NeuronMutations.markUnknown(id,"Status response was not matching and conclusive.");if((await window.NeuronMutations.get(id))?.status==="CONFIRMED")await refresh();}catch(_){await window.NeuronMutations.markUnknown(id,"Status check could not verify the update.");}await pendingRefresh();}
  async function retry(id){const m=await window.NeuronMutations.get(id);if(!m||!["PENDING","UNKNOWN"].includes(m.status))return;try{const e=await window.NeuronMutations.retryEnvelope(id),r=await post(e.payload,35000);await window.NeuronMutations.classifyTransportResult(id,{ok:r.response.ok},r.body);if((await window.NeuronMutations.get(id))?.status==="CONFIRMED")await refresh();}catch(_){await window.NeuronMutations.markUnknown(id,"Retry outcome remains uncertain; original mutation retained.");}await pendingRefresh();}
  async function pendingRefresh(){const l=$("eegCallsAmbajogaiUpdatePendingList");try{await window.NeuronDataReady;const items=(await window.NeuronMutations.list()).filter(m=>m.eventType===EVENT_TYPE&&m.city===CITY&&["PENDING","IN_FLIGHT","UNKNOWN"].includes(m.status)).sort((a,b)=>b.createdAt-a.createdAt);l.replaceChildren();if(!items.length){const p=document.createElement("p");p.className="field-hint";p.textContent="No unresolved Ambajogai EEG Calls updates.";l.append(p);return;}items.forEach(m=>{const c=document.createElement("article");c.className="eeg-call-pending-item";const t=document.createElement("strong"),d=document.createElement("p");t.textContent=m.payload.patientName+" · "+window.NeuronMutations.presentation(m.status).label;d.textContent="Appointment: "+m.payload.appointmentId+" · Request: "+m.requestId;c.append(t,d);const s=document.createElement("button");s.type="button";s.className="secondary-button";s.textContent="Check status";s.addEventListener("click",()=>status(m.requestId));c.append(s);if(["PENDING","UNKNOWN"].includes(m.status)){const r=document.createElement("button");r.type="button";r.className="secondary-button";r.textContent="Retry same update";r.addEventListener("click",()=>retry(m.requestId));c.append(r);}l.append(c);});}catch(_){l.textContent="Unable to read saved update requests.";}}
  function switchMode(update){$("eegCallsAmbajogaiBookingWorkspace").hidden=update;$("eegCallsAmbajogaiUpdateWorkspace").hidden=!update;$("eegCallsAmbajogaiBookingTab").setAttribute("aria-pressed",String(!update));$("eegCallsAmbajogaiUpdateTab").setAttribute("aria-pressed",String(update));$("eegCallsAmbajogaiBookingTab").className=update?"secondary-button":"primary-button";$("eegCallsAmbajogaiUpdateTab").className=update?"primary-button":"secondary-button";if(update&&!records.length)refresh();}
  window.initializeAmbajogaiEegCallsUpdateFeature=function(){if(!initialized){initialized=true;$("eegCallsAmbajogaiBookingTab").addEventListener("click",()=>switchMode(false));$("eegCallsAmbajogaiUpdateTab").addEventListener("click",()=>switchMode(true));$("eegCallsAmbajogaiUpdateRefresh").addEventListener("click",refresh);$("eegCallsAmbajogaiUpdateSearch").addEventListener("input",render);$("eegCallsAmbajogaiUpdateForm").addEventListener("submit",submit);$("eegCallsAmbajogaiUpdateCancel").addEventListener("click",()=>{selected=null;$("eegCallsAmbajogaiUpdateForm").hidden=true;render();});$("eegCallsAmbajogaiUpdatePendingRefresh").addEventListener("click",pendingRefresh);cacheRead().then(found=>{if(!found)refresh();else backgroundCheck();}).catch(()=>refresh());window.addEventListener("online",backgroundCheck);window.addEventListener("focus",backgroundCheck);setInterval(backgroundCheck,15*60*1000);}pendingRefresh();};
})();
