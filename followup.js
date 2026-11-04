/* Follow-up patient workspace. Search is intentionally bounded like Android's
 * FollowupRepository.search(); this screen does not request an unbounded history. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  let results = [];
  let requestSequence = 0;
  let initialized = false;
  let selected = null;

  function user() { return typeof activeUser !== "undefined" ? activeUser : null; }
  function normCity(value) { return typeof normalizeCity === "function" ? normalizeCity(value) : String(value || "").trim(); }
  function permittedCities() {
    const u = user();
    if (!u) return [];
    return u.admin === true || normCity(u.city) === "Latur" ? CITIES.slice() : CITIES.filter((c) => c === normCity(u.city));
  }
  function dateKey(value) {
    const raw = String(value || "").trim();
    if (/^\d{8}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return match ? match[1] + match[2].padStart(2, "0") + match[3].padStart(2, "0") : "";
  }
  function prettyDate(value) {
    const key = dateKey(value);
    if (!key) return String(value || "—");
    const month = Number(key.slice(4, 6));
    if (month < 1 || month > 12) return String(value || "—");
    return key.slice(6, 8) + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] + " " + key.slice(0, 4);
  }
  function validDateKey(key) {
    if (!/^\d{8}$/.test(key)) return false;
    const y = Number(key.slice(0, 4)), m = Number(key.slice(4, 6)), d = Number(key.slice(6, 8));
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }
  function indiaTodayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type) => parts.find((p) => p.type === type).value;
    return part("year") + part("month") + part("day");
  }
  // Port of Android FollowupAge.current(): age is reconstructed at the historical
  // registration date, then recalculated as of today's date in Asia/Kolkata.
  function currentAge(ageValue, ageUnitValue, registrationDateKey) {
    const age = Number(ageValue);
    const unit = String(ageUnitValue || "years").toLowerCase();
    const key = dateKey(registrationDateKey);
    const fallback = [Number.isInteger(age) ? String(age) : String(age), String(ageUnitValue || "years")];
    if (!Number.isFinite(age) || !validDateKey(key)) return fallback;
    let birth = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
    const whole = Math.floor(age);
    if (unit.startsWith("day")) {
      birth.setUTCDate(birth.getUTCDate() - Math.round(age));
    } else if (unit.startsWith("month")) {
      birth = addUtcMonths(birth, -whole);
      birth.setUTCDate(birth.getUTCDate() - Math.round((age - whole) * 30));
    } else {
      birth = addUtcMonths(birth, -whole * 12);
      birth = addUtcMonths(birth, -Math.round((age - whole) * 12));
    }
    const todayKey = indiaTodayKey();
    const now = new Date(Date.UTC(Number(todayKey.slice(0, 4)), Number(todayKey.slice(4, 6)) - 1, Number(todayKey.slice(6, 8))));
    let months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();
    if (now.getUTCDate() < birth.getUTCDate()) months--;
    months = Math.max(0, months);
    if (months >= 12) {
      const years = Math.round((months / 12) * 2) / 2;
      return [Number.isInteger(years) ? String(years) : String(years), "years"];
    }
    if (months >= 1) return [String(months), "months"];
    const days = Math.max(0, Math.round((now.getTime() - birth.getTime()) / 86400000));
    return [String(days), "days"];
  }
  function addUtcMonths(date, amount) {
    const originalDay = date.getUTCDate();
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(originalDay, lastDay));
    return target;
  }
  function patientIdentity(patient) {
    return [patient.city, patient.date, patient.sourceRow, normalizeWords(patient.name).toLowerCase(), patient.whatsapp].join("|");
  }
  function normalizeWords(value) {
    return String(value || "").trim().split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function showStatus(message, isError) {
    const el = $("followupStatus");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
  }
  function cacheStatusText(state) {
    const el = $("followupCacheState");
    if (!el) return;
    if (!state) { el.textContent = "Local cache status: not initialized"; return; }
    const when = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never";
    const labels = { READY: "Ready", SYNCING: "Syncing", FAILED: "Failed — cached records retained", BUILD_FAILED: "Build failed — cached records retained" };
    el.textContent = "Local cache: " + (labels[state.status] || "Not initialized") + " · " + Number(state.recordCount || 0) + " records · Last successful sync: " + when + (state.lastError ? " · " + state.lastError : "");
    el.classList.toggle("is-error", state.status === "FAILED" || state.status === "BUILD_FAILED");
  }
  async function refreshCacheState(city) {
    if (!window.NeuronFollowupCache) return null;
    try { const state = await window.NeuronFollowupCache.getState(city); cacheStatusText(state); return state; }
    catch (e) { cacheStatusText(null); return null; }
  }
  async function synchronize(city, force) {
    const syncButton = $("followupSyncButton");
    if (!window.NeuronFollowupCache) return;
    if (syncButton) { syncButton.disabled = true; syncButton.textContent = "Syncing…"; }
    await refreshCacheState(city);
    try {
      const runSync = () => window.NeuronFollowupCache.sync(city, { force: !!force });
      const coordinated = window.NeuronSyncCoordinator
        ? await window.NeuronSyncCoordinator.run(`followup:${city}`, runSync, { waitForLeaseMs: 30000 })
        : { status: "SUCCESS", result: await runSync() };
      if (coordinated.status !== "SUCCESS") throw new Error("Follow-up synchronization is already running in another tab. Try again shortly.");
      const result = coordinated.result;
      cacheStatusText(result.state);
      showStatus(result.unchanged ? "Follow-up cache is already current for today." : "Follow-up cache synchronization completed.", false);
    } catch (error) {
      await refreshCacheState(city);
      showStatus(error && error.message ? error.message : "Follow-up cache sync failed. Existing cached records were retained.", true);
    } finally {
      if (syncButton) { syncButton.disabled = false; syncButton.textContent = "Sync Follow-up Cache"; }
    }
  }
  async function searchLocalCache(city, query, isPhone) {
    if (!window.NeuronFollowupCache) return [];
    const cached = await window.NeuronFollowupCache.getRecords(city);
    const q = query.toLowerCase();
    return cached.filter((p) => isPhone ? String(p.whatsapp || "") === query.replace(/\D/g, "").slice(-10) : String(p.name || "").toLowerCase().includes(q))
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)) || String(b.time).localeCompare(String(a.time)) || b.sourceRow - a.sourceRow)
      .slice(0, 30).map((p) => readPatient(p, city)).filter(Boolean);
  }
  function readPatient(raw, city) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || raw.patientName || raw.patient || "").trim();
    const age = Number(raw.age);
    const date = String(raw.date || raw.visitingDate || raw.appointmentDate || "").trim();
    const key = dateKey(date);
    const row = Number(raw.sourceRow ?? raw.rowNumber ?? raw.row ?? 0);
    if (!name || !Number.isFinite(age) || age < 0 || !validDateKey(key) || !Number.isInteger(row) || row < 0) return null;
    const actualCity = normCity(raw.city || raw.visitingCity || city);
    if (actualCity !== city) return null;
    return {
      sourceRow: row,
      date,
      time: String(raw.time || raw.appointmentTime || "").trim(),
      name,
      age,
      ageUnit: String(raw.ageUnit || raw.unit || "years").trim().toLowerCase() || "years",
      address: String(raw.address || "").trim(),
      patientType: String(raw.patientType || raw.type || "Follow-up").trim(),
      whatsapp: String(raw.whatsapp || raw.whatsappNumber || raw.mobileNumber || raw.mobile || "").replace(/\D/g, "").slice(-10),
      city: actualCity,
      referredBy: String(raw.referredBy || raw.reference || "").trim(),
      nextFollowupCity: normCity(raw.nextFollowupCity || raw.nextFollowUpCity || "")
    };
  }
  function sortAndFilter() {
    const from = dateKey($("followupDateFrom").value);
    const to = dateKey($("followupDateTo").value);
    const q = String($("followupSearch").value || "").trim().toLowerCase();
    const sort = $("followupSort").value;
    const filtered = results.filter((p) => {
      const key = dateKey(p.date);
      if (from && key < from) return false;
      if (to && key > to) return false;
      if (q && ![p.name, p.whatsapp, p.address, p.referredBy, p.nextFollowupCity].some((v) => String(v || "").toLowerCase().includes(q))) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (sort === "date-asc") return dateKey(a.date).localeCompare(dateKey(b.date)) || a.name.localeCompare(b.name);
      if (sort === "name-asc") return a.name.localeCompare(b.name) || dateKey(b.date).localeCompare(dateKey(a.date));
      if (sort === "name-desc") return b.name.localeCompare(a.name) || dateKey(b.date).localeCompare(dateKey(a.date));
      return dateKey(b.date).localeCompare(dateKey(a.date)) || String(b.time).localeCompare(String(a.time)) || b.sourceRow - a.sourceRow;
    });
    render(filtered);
  }
  function render(list) {
    const container = $("followupPatientCards");
    if (!container) return;
    $("followupResultCount").textContent = list.length + (list.length === 1 ? " patient" : " patients");
    if (!list.length) {
      container.innerHTML = '<div class="followup-empty">No matching follow-up records. Adjust the search or date filters.</div>';
      return;
    }
    container.innerHTML = list.map((p, index) => {
      const chosen = selected && selected.sourceRow === p.sourceRow && selected.city === p.city && selected.date === p.date && selected.name === p.name;
      const age = currentAge(p.age, p.ageUnit, p.date);
      return '<button type="button" class="followup-patient-card' + (chosen ? ' selected' : '') + '" data-followup-index="' + index + '" aria-pressed="' + (chosen ? "true" : "false") + '">' +
        '<span class="followup-card-top"><strong>' + escapeHtml(normalizeWords(p.name)) + '</strong><span class="followup-card-select">' + (chosen ? "Selected" : "Select") + '</span></span>' +
        '<span class="followup-card-meta">' + escapeHtml(age[0] + " " + age[1] + " · " + p.city) + '</span>' +
        '<span class="followup-card-meta">Previous visit: ' + escapeHtml(prettyDate(p.date)) + (p.time ? " · " + escapeHtml(p.time) : "") + '</span>' +
        (p.whatsapp ? '<span class="followup-card-meta">WhatsApp: ' + escapeHtml(p.whatsapp) + '</span>' : "") +
        '</button>';
    }).join("");
    container.querySelectorAll("[data-followup-index]").forEach((button, index) => {
      button.addEventListener("click", () => selectPatient(list[index]));
    });
  }
  function selectPatient(patient) {
    selected = patient;
    const panel = $("followupSelectedPatient");
    panel.hidden = false;
    const age = currentAge(patient.age, patient.ageUnit, patient.date);
    $("followupSelectedDetails").innerHTML = [
      ["Patient", normalizeWords(patient.name)], ["Age at current date", age[0] + " " + age[1]], ["Age recorded", patient.age + " " + patient.ageUnit], ["City", patient.city],
      ["Previous visit", prettyDate(patient.date) + (patient.time ? " · " + patient.time : "")], ["WhatsApp", patient.whatsapp || "—"],
      ["Address", patient.address || "—"], ["Referred by", patient.referredBy || "—"], ["Next follow-up city", patient.nextFollowupCity || "—"]
    ].map(([label, value]) => '<div class="followup-detail"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>').join("");
    sortAndFilter();
  }
  async function search() {
    const seq = ++requestSequence;
    const u = user();
    const city = normCity($("followupCity").value);
    const query = String($("followupQuery").value || "").trim().replace(/\s+/g, " ");
    if (!u || !permittedCities().includes(city)) { showStatus("Your account cannot search this city.", true); return; }
    if (query.length < 2) { showStatus("Enter a patient name or WhatsApp number to search.", true); return; }
    const digits = query.replace(/\D/g, "");
    const isPhone = /^\d+$/.test(query) && /^[6-9]\d{9}$/.test(digits);
    if (/^\d+$/.test(query) && !isPhone) { showStatus("Enter a valid 10-digit WhatsApp number or search by patient name.", true); return; }
    selected = null;
    $("followupSelectedPatient").hidden = true;
    const button = $("followupSearchButton");
    button.disabled = true;
    button.textContent = "Searching…";
    showStatus("Searching follow-up records for " + city + "…", false);
    try {
      let mapped = await searchLocalCache(city, isPhone ? digits : query, isPhone);
      const usedLocalCache = mapped.length > 0;
      if (seq !== requestSequence) return;
      if (!mapped.length) {
        const payload = {
          action: isPhone ? "getPatientHistoryByWhatsApp" : "searchFollowupPatients",
          city,
          ...(isPhone ? { whatsapp: digits } : { query, queryType: "NAME" }),
          username: u.username,
          password: u.password,
          installationId: getInstallationId(),
          sessionId: u.sessionId || "",
          sourceFcmToken: ""
        };
        const response = await fetchWithTimeout(BACKEND_URL, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
          body: JSON.stringify(payload), cache: "no-store", redirect: "follow"
        }, 35000);
        if (!response.ok) throw new Error("Backend request failed (HTTP " + response.status + ").");
        const data = await response.json();
        if (seq !== requestSequence) return;
        if (!data || data.ok !== true) throw new Error(String(data && data.error || "Follow-up search failed."));
        const responseCity = normCity(data.city || data.visitingCity || city);
        if (responseCity !== city) throw new Error("Follow-up search returned a different city.");
        const array = Array.isArray(data.patients) ? data.patients : Array.isArray(data.records) ? data.records : [];
        mapped = array.map((raw) => readPatient(raw, city)).filter(Boolean);
      }
      const unique = new Map();
      mapped.forEach((patient) => { const key = patientIdentity(patient); if (!unique.has(key)) unique.set(key, patient); });
      results = Array.from(unique.values()).slice(0, 30);
      results.sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)) || String(b.time).localeCompare(String(a.time)) || b.sourceRow - a.sourceRow);
      showStatus(results.length ? (usedLocalCache ? "Search completed from the saved local cache. Select a patient card to review the record." : "Search completed from the server. Select a patient card to review the record.") : "No follow-up patient found.", false);
      sortAndFilter();
    } catch (error) {
      if (seq === requestSequence) {
        results = [];
        render([]);
        showStatus(error && error.message ? error.message : "Follow-up search failed. Please retry.", true);
      }
    } finally {
      if (seq === requestSequence) {
        button.disabled = false;
        button.textContent = "Search Patient";
      }
    }
  }
  function init() {
    if (initialized) return;
    initialized = true;
    const citySelect = $("followupCity");
    if (!citySelect) return;
    citySelect.innerHTML = permittedCities().map((c) => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join("");
    const assigned = normCity(user() && user().city);
    if (permittedCities().includes(assigned)) citySelect.value = assigned;
    $("followupBackButton").addEventListener("click", () => setView("home"));
    $("followupSearchButton").addEventListener("click", search);
    $("followupSyncButton").addEventListener("click", () => synchronize(normCity(citySelect.value), true));
    refreshCacheState(normCity(citySelect.value)).then((state) => { if (!state || state.status !== "READY") synchronize(normCity(citySelect.value), false); });
    $("followupQuery").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); search(); } });
    ["followupSearch", "followupDateFrom", "followupDateTo", "followupSort"].forEach((id) => $(id).addEventListener(id === "followupSearch" ? "input" : "change", sortAndFilter));
    $("followupCity").addEventListener("change", () => { results = []; selected = null; $("followupSelectedPatient").hidden = true; render([]); showStatus("City changed. Search for a patient in the selected city.", false); const city = normCity(citySelect.value); refreshCacheState(city).then((state) => { if (!state || state.status !== "READY") synchronize(city, false); }); });
    $("followupClearFilters").addEventListener("click", () => { $("followupSearch").value = ""; $("followupDateFrom").value = ""; $("followupDateTo").value = ""; $("followupSort").value = "date-desc"; sortAndFilter(); });
    $("followupClearSelection").addEventListener("click", () => { selected = null; $("followupSelectedPatient").hidden = true; sortAndFilter(); });
    $("followupBookOpdButton").addEventListener("click", () => {
      if (!selected) { showStatus("Select an exact historical patient record first.", true); return; }
      if (typeof window.prefillOpdFromFollowup !== "function") {
        showStatus("OPD booking integration is unavailable. Reload the website and try again.", true);
        return;
      }
      window.prefillOpdFromFollowup(selected);
    });
  }
  window.initializeFollowupFeature = init;
})();
