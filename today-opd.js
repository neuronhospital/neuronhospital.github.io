"use strict";

let todayOpdPatients = [];
let todayOpdSelected = null;
let todayOpdLoadedCity = "";
let todayOpdLoading = false;
let todayOpdReloadQueued = false;
let todayOpdInitialized = false;
let todayOpdRefreshTimer = null;
let todayOpdLastSyncKey = "";
const TODAY_OPD_CACHE_TTL_MS = 15 * 60 * 1000;
const TODAY_OPD_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

function initializeTodayOpdFeature() {
  const citySelect = document.getElementById("todayCitySelect");
  if (!citySelect || todayOpdInitialized) return;
  todayOpdInitialized = true;
  const availableCities = typeof allowedAccountCities === "function" ? allowedAccountCities() : OPD_CITIES;
  const bookingCity = normalizeCity(document.getElementById("opdVisitingCity")?.value || "");
  const initialCity = availableCities.includes(bookingCity) ? bookingCity :
    (typeof defaultOpdCity === "function" && availableCities.includes(defaultOpdCity()) ? defaultOpdCity() : (availableCities[0] || ""));
  setSelectOptions(citySelect, availableCities, "Select city", initialCity);
  Array.from(citySelect.options).forEach((option) => {
    if (!option.value) return;
    const scheduled = typeof scheduledToday === "function" && scheduledToday(option.value);
    const special = typeof activeSpecialCity === "function" && activeSpecialCity() === option.value;
    option.textContent = option.value + (scheduled ? " · Scheduled today" : special ? " · Special Access" : " · Not scheduled today");
  });
  document.getElementById("todayRefreshButton").addEventListener("click", () => loadTodayOpdPatients({ force: true }));
  document.getElementById("todayCitySelect").addEventListener("change", loadTodayOpdPatients);
  document.getElementById("todaySearch").addEventListener("input", renderTodayOpdPatients);
  document.getElementById("todaySortSelect").addEventListener("change", renderTodayOpdPatients);
  document.getElementById("todayStatusFilter").addEventListener("change", renderTodayOpdPatients);
  document.getElementById("todayBackButton").addEventListener("click", () => setView("home"));
  window.addEventListener("neuron:opd-mutation-confirmed", (event) => {
    const detail = event.detail || {};
    const currentDate = indiaDateParts().key;
    const eventCity = todayOpdNormalizeCity(detail.city);
    const selectedCity = todayOpdNormalizeCity(document.getElementById("todayCitySelect").value);
    if (String(detail.date).replace(/\D/g, "") !== currentDate) return;
    if (eventCity !== selectedCity) return;
    // Pull the authoritative snapshot after a confirmed mutation. Never locally
    // synthesize serial/payment fields from the mutation response.
    if (document.getElementById("todayContent")?.hidden === false) loadTodayOpdPatients({ force: true });
    else window.NeuronStorage?.markSliceStale({ scope: "opdToday", city: selectedCity, date: currentDate, reason: "A confirmed OPD mutation requires snapshot refresh." }).catch(() => {});
  });
  window.addEventListener("online", () => { if (document.getElementById("todayContent")?.hidden === false) loadTodayOpdPatients(); });
  window.addEventListener("focus", () => { if (document.getElementById("todayContent")?.hidden === false) refreshTodayOpdIfStale(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && document.getElementById("todayContent")?.hidden === false) refreshTodayOpdIfStale(); });
  if (todayOpdRefreshTimer == null) todayOpdRefreshTimer = window.setInterval(() => {
    if (!document.hidden && document.getElementById("todayContent")?.hidden === false) refreshTodayOpdIfStale();
  }, TODAY_OPD_REFRESH_INTERVAL_MS);
  loadTodayOpdPatients();
}

function todayOpdCacheKey(city, dateKey) { return "opdToday|" + city + "|" + dateKey; }

function todayOpdNormalizeDateKey(value, fallback) {
  const raw = String(value || fallback || "").trim();
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : String(fallback || "");
}

function todayOpdNormalizeCity(value) {
  return typeof normalizeCity === "function" ? normalizeCity(value) : String(value || "").trim();
}

function todayOpdNormalizePatients(patients, city, dateKey) {
  // Booking request identity is primary: one booking must never appear twice even
  // if an inconsistent snapshot contains different appointment IDs for it.
  const seenRequests = new Set();
  const seenAppointments = new Set();
  const selectedCity = todayOpdNormalizeCity(city);
  return patients.filter((patient) => {
    if (!patient || typeof patient !== "object") return false;
    const requestId = String(patient.bookingRequestId || "").trim();
    if (!requestId) return false;
    const patientCity = todayOpdNormalizeCity(patient.city || city);
    if (patientCity !== selectedCity) return false;
    const patientDate = todayOpdNormalizeDateKey(patient.date || patient.appointmentDate, dateKey);
    if (patientDate !== dateKey) return false;
    const appointmentId = String(patient.appointmentId || "").trim();
    if (seenRequests.has(requestId) || (appointmentId && seenAppointments.has(appointmentId))) return false;
    seenRequests.add(requestId);
    if (appointmentId) seenAppointments.add(appointmentId);
    return true;
  });
}

function todayOpdAppointmentSerial(patient) {
  const explicit = Number(patient?.serial);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const appointmentId = String(patient?.appointmentId || "");
  const matches = appointmentId.match(/(?:^|[-/])(\d+)$/);
  return matches ? Number(matches[1]) : 0;
}

function notifyTodayOpdMutationConfirmed(detail) {
  if (!detail || !detail.city || !detail.date) return;
  window.dispatchEvent(new CustomEvent("neuron:opd-mutation-confirmed", { detail }));
}

async function readTodayOpdCache(city, dateKey) {
  if (!window.NeuronStorage) return null;
  const [records, sync] = await Promise.all([
    window.NeuronStorage.getRecords({ scope: "opdToday", city, date: dateKey }),
    window.NeuronStorage.getSyncState({ scope: "opdToday", city, date: dateKey })
  ]);
  if (!sync || !["complete", "stale"].includes(sync.status)) return null;
  return { patients: records.map((record) => record.data), sync };
}

async function writeTodayOpdCache(patients, city, dateKey, syncVersion) {
  if (!window.NeuronStorage) return;
  const completedAt = Date.now();
  const records = patients.map((patient) => ({
    recordId: String(patient.bookingRequestId || patient.appointmentId),
    data: patient,
    status: "current",
    updatedAt: completedAt
  }));
  // The EEG booking candidate cache is a derived view of the same verified OPD
  // snapshot. Keep its records and checkpoint in the same IndexedDB transaction.
  const eegEligible = patients.filter((patient) => {
    const charges = patient.eegCharges;
    return charges == null || String(charges).trim() === "";
  });
  const eegRecords = eegEligible.map((patient) => ({
    recordId: String(patient.bookingRequestId || patient.appointmentId),
    data: patient,
    status: "current",
    updatedAt: completedAt
  }));
  if (typeof window.NeuronStorage.replaceSlices === "function") {
    await window.NeuronStorage.replaceSlices([
      { scope: "opdToday", city, date: dateKey, records, syncVersion, completedAt },
      { scope: "eegToday", city, date: dateKey, records: eegRecords, syncVersion, completedAt }
    ]);
  } else {
    await window.NeuronStorage.replaceSlice({ scope: "opdToday", city, date: dateKey, records, syncVersion, completedAt });
  }
}

function setTodayOpdSyncStatus(text, stale = false) {
  const status = document.getElementById("todaySyncStatus");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-stale", stale);
  status.setAttribute("aria-live", "polite");
}

async function loadTodayOpdPatients(options = {}) {
  if (todayOpdLoading) { todayOpdReloadQueued = true; return; }
  const city = document.getElementById("todayCitySelect").value;
  const list = document.getElementById("todayPatientList");
  const message = document.getElementById("todayMessage");
  const date = indiaDateParts();
  todayOpdSelected = null;
  todayOpdPatients = [];
  todayOpdLoadedCity = "";
  document.getElementById("todaySelectedDetails").innerHTML = '<p class="field-hint">No patient selected.</p>';
  list.replaceChildren();
  if (!city) { message.textContent = "Choose an available city to load today's OPD."; return; }
  if (!activeUser) { message.textContent = "Sign in to load today's OPD."; return; }
  todayOpdLoading = true;
  document.getElementById("todayRefreshButton").disabled = true;
  const syncKey = todayOpdCacheKey(city, date.key);
  todayOpdLastSyncKey = syncKey;
  message.textContent = "Loading today's OPD snapshot…";
  try {
    await window.NeuronDataReady;
    // Render a city/date-scoped IndexedDB snapshot first; it remains explicitly
    // labelled stale until a verified server snapshot replaces it.
    try {
      const cached = await readTodayOpdCache(city, date.key);
      if (cached && todayOpdLastSyncKey === syncKey) {
        todayOpdPatients = todayOpdNormalizePatients(cached.patients, city, date.key);
        todayOpdLoadedCity = city;
        document.getElementById("todayDateScope").textContent = "Appointment date: " + date.iso + " (India time) · City: " + city + " · Local cached snapshot";
        const ageMs = Math.max(0, Date.now() - Number(cached.sync.lastSuccessAt || 0));
        const stale = cached.sync.status !== "complete" || ageMs >= TODAY_OPD_CACHE_TTL_MS;
        setTodayOpdSyncStatus("Cached snapshot · " + new Date(cached.sync.lastSuccessAt).toLocaleString() + (stale ? " · Refresh required" : " · Recent"), stale);
        message.textContent = todayOpdPatients.length ? "Showing locally cached OPD while checking the server…" : "Cached snapshot is empty; checking the server…";
        renderTodayOpdPatients();
      }
    } catch (cacheError) {
      setTodayOpdSyncStatus("Local cache unavailable; loading from server.", true);
    }
    if (!navigator.onLine) {
      if (todayOpdLoadedCity === city) message.textContent = "Offline: showing cached OPD data. Refresh when the connection returns.";
      else message.textContent = "You are offline and no verified cached snapshot is available.";
      setTodayOpdSyncStatus("Offline · Cached data may be stale", true);
      return;
    }
    const request = () => fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify({ action: "getTodayOPDFromProperties", city, date: date.key,
        username: activeUser.username, password: activeUser.password,
        installationId: getInstallationId(), sessionId: activeUser.sessionId || "" }),
      cache: "no-store", redirect: "follow"
    });
    const coordinated = window.NeuronSyncCoordinator
      ? await window.NeuronSyncCoordinator.run(`opdToday:${city}:${date.key}`, request, { waitForLeaseMs: 25000 })
      : { status: "SUCCESS", result: await request() };
    if (coordinated.status !== "SUCCESS" || !coordinated.result) throw new Error("Another tab is synchronizing today's OPD. Wait briefly, then refresh again.");
    const response = coordinated.result;
    if (!response.ok) throw new Error("Patient list request failed (HTTP " + response.status + ").");
    const data = await response.json();
    if (data.ok !== true || data.city !== city || data.date !== date.key || data.complete !== true || !Array.isArray(data.patients)) {
      throw new Error(data.error || "The server response was not verified as a complete current-day OPD snapshot.");
    }
    if (todayOpdLastSyncKey !== syncKey || document.getElementById("todayCitySelect").value !== city) return;
    todayOpdPatients = todayOpdNormalizePatients(data.patients, city, date.key);
    todayOpdLoadedCity = city;
    try { await writeTodayOpdCache(todayOpdPatients, city, date.key, data.syncVersion ?? null); }
    catch (cacheError) { /* Server data is usable even if browser storage is unavailable. */ }
    setTodayOpdSyncStatus("Server synced · " + new Date().toLocaleString() + " · " + (navigator.onLine ? "Online" : "Offline"), false);
    document.getElementById("todayDateScope").textContent = "Appointment date: " + date.iso + " (India time) · City: " + city + " · Verified complete snapshot";
    message.textContent = todayOpdPatients.length ? "Today's OPD loaded and synchronized." : "No OPD patients found for " + city + " today.";
    renderTodayOpdPatients();
  } catch (error) {
    if (todayOpdLoadedCity === city) {
      try { await window.NeuronStorage?.markSliceStale({ scope: "opdToday", city, date: date.key, reason: error instanceof Error ? error.message : "Server sync failed" }); } catch (_) {}
      message.textContent = "Server sync failed; showing cached OPD data. " + (error instanceof Error ? error.message : "Retry when connected.");
      setTodayOpdSyncStatus("Sync failed · Cached data retained", true);
    } else {
      todayOpdPatients = [];
      message.textContent = error instanceof Error ? error.message : "Unable to load today's OPD.";
      setTodayOpdSyncStatus("No verified cache available · Sync failed", true);
      renderTodayOpdPatients();
    }
  } finally {
    todayOpdLoading = false;
    document.getElementById("todayRefreshButton").disabled = false;
    if (todayOpdReloadQueued) {
      todayOpdReloadQueued = false;
      window.setTimeout(() => loadTodayOpdPatients(), 0);
    }
  }
}

async function refreshTodayOpdIfStale() {
  const city = document.getElementById("todayCitySelect")?.value;
  if (!city || todayOpdLoading || !activeUser || !navigator.onLine) return;
  const date = indiaDateParts();
  try {
    const sync = await window.NeuronStorage?.getSyncState({ scope: "opdToday", city, date: date.key });
    if (!sync || sync.status !== "complete" || Date.now() - Number(sync.lastSuccessAt || 0) >= TODAY_OPD_CACHE_TTL_MS) {
      await loadTodayOpdPatients();
    }
  } catch (_) { await loadTodayOpdPatients(); }
}

function todayOpdPaymentState(patient) {
  const charges = Math.max(0, Number(patient.opdCharges || 0));
  const paid = Math.max(0, Number(patient.opdCashPaid || 0) + Number(patient.opdOnlinePaid || 0));
  if (paid <= 0) return { key: "unpaid", label: "No payment", due: charges };
  if (paid + 0.009 >= charges) return { key: "paid", label: "Paid", due: 0 };
  return { key: "due", label: "Balance due", due: Math.max(0, charges - paid) };
}

function renderTodayOpdPatients() {
  const list = document.getElementById("todayPatientList");
  if (!list) return;
  const query = String(document.getElementById("todaySearch")?.value || "").trim().toLocaleLowerCase();
  const sort = document.getElementById("todaySortSelect")?.value || "serial-desc";
  const statusFilter = document.getElementById("todayStatusFilter")?.value || "all";
  const filtered = todayOpdPatients.filter((patient) => {
    const searchText = [patient.name, patient.appointmentId, patient.whatsapp, patient.bookingRequestId]
      .map((value) => String(value || "").toLocaleLowerCase()).join(" ");
    return (!query || searchText.includes(query)) && (statusFilter === "all" || todayOpdPaymentState(patient).key === statusFilter);
  });
  filtered.sort((a, b) => {
    if (sort === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""));
    if (sort === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
    const aSerial = todayOpdAppointmentSerial(a);
    const bSerial = todayOpdAppointmentSerial(b);
    return sort === "serial-asc" ? aSerial - bSerial : bSerial - aSerial;
  });
  list.replaceChildren();
  document.getElementById("todayPatientCount").textContent = filtered.length + " of " + todayOpdPatients.length + " patient(s)";
  if (!filtered.length) {
    const empty = document.createElement("p"); empty.className = "field-hint";
    empty.textContent = todayOpdPatients.length ? "No patients match the selected search/filter." : "Load a city snapshot to see patients.";
    list.append(empty); return;
  }
  filtered.forEach((patient) => {
    const card = document.createElement("button"); card.type = "button"; card.className = "today-patient-card";
    const identity = String(patient.bookingRequestId || "");
    card.setAttribute("aria-pressed", String(todayOpdSelected?.bookingRequestId === identity));
    if (todayOpdSelected?.bookingRequestId === identity) card.classList.add("selected");
    const name = document.createElement("strong"); name.textContent = String(patient.name || "Patient");
    const meta = document.createElement("span"); meta.textContent = [patient.appointmentId || "Appointment ID unavailable", (String(patient.age ?? "") + " " + String(patient.ageUnit || "")).trim(), patient.whatsapp ? "WhatsApp " + patient.whatsapp : ""].filter(Boolean).join(" · ");
    const payment = todayOpdPaymentState(patient);
    const status = document.createElement("span"); status.className = "today-status-pill status-" + payment.key; status.textContent = payment.label + (payment.due > 0 ? " · Due ₹" + payment.due : "");
    card.append(name, meta, status);
    card.addEventListener("click", () => selectTodayOpdPatient(patient));
    list.append(card);
  });
}

function selectTodayOpdPatient(patient) {
  todayOpdSelected = patient;
  renderTodayOpdPatients();
  const target = document.getElementById("todaySelectedDetails"); target.replaceChildren();
  const payment = todayOpdPaymentState(patient);
  const details = [
    ["Patient", patient.name], ["Appointment ID", patient.appointmentId], ["Age", (String(patient.age ?? "") + " " + String(patient.ageUnit || "")).trim()],
    ["WhatsApp", patient.whatsapp], ["Address", patient.address], ["City", patient.city || todayOpdLoadedCity], ["Appointment time", patient.time],
    ["Patient type", patient.patientType], ["OPD charges", "₹" + Number(patient.opdCharges || 0)],
    ["Cash paid", "₹" + Number(patient.opdCashPaid || 0)], ["Online paid", "₹" + Number(patient.opdOnlinePaid || 0)],
    ["Payment status", payment.label], ["Balance", "₹" + payment.due], ["Follow-up city", patient.nextFollowupCity]
  ];
  details.forEach(([label, value]) => {
    if (value == null || String(value).trim() === "") return;
    const row = document.createElement("div"); row.className = "today-detail-row";
    const key = document.createElement("span"); key.textContent = label;
    const val = document.createElement("strong"); val.textContent = String(value);
    row.append(key, val); target.append(row);
  });
}

window.initializeTodayOpdFeature = initializeTodayOpdFeature;
