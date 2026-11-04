/* Administrator cancelled-visit calendar. Uses the existing Apps Script contract only. */
(() => {
  "use strict";
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const ZONE = "Asia/Kolkata";
  const $ = (id) => document.getElementById(id);
  let initialized = false;
  let busy = false;
  let verified = false;
  let dirty = false;
  let currentConfig = null;
  let specialMode = { enabled: false, city: "", date: "" };
  let selectedDates = new Set();
  let requestCounter = 0;
  let sessionKey = "";

  function todayIso() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${v.year}-${v.month}-${v.day}`;
  }
  function monthIso(iso) { return iso.slice(0, 7); }
  function isoToKey(iso) { return iso.replaceAll("-", ""); }
  function keyToIso(key) { return /^\d{8}$/.test(key) ? `${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}` : ""; }
  function validIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const d = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === iso;
  }
  function scheduled(city, iso) {
    if (!validIso(iso)) return false;
    const d = new Date(`${iso}T12:00:00Z`), day = d.getUTCDay(), week = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    switch (city) {
      case "Latur": return [1,2,3,5,6].includes(day) || ((day === 4 || day === 0) && week === 5);
      case "Nilanga": return day === 6 && week === 1;
      case "Udgir": return day === 0 && [2,4].includes(week);
      case "Beed": return day === 4 && [2,4].includes(week);
      case "Ambajogai": return day === 0 && [1,3].includes(week);
      case "Dharashiv": return day === 4 && [1,3].includes(week);
      case "Barshi": return day === 4 && [1,3].includes(week);
      case "Omerga": return day === 6 && week >= 2 && week <= 5;
      default: return false;
    }
  }
  function isSpecialDate(city, iso) {
    return specialMode.enabled === true && specialMode.city === city && specialMode.date === iso && iso === todayIso();
  }
  function validConfig(value) {
    return value && typeof value === "object" && CITIES.every((city) => Array.isArray(value[city]) && value[city].every((key) => /^\d{8}$/.test(String(key)) && validIso(keyToIso(String(key)))));
  }
  function datesFor(city) {
    return new Set((currentConfig && Array.isArray(currentConfig[city]) ? currentConfig[city] : []).map(keyToIso).filter(validIso));
  }
  function sanitizeDates(city, dates) {
    const today = todayIso();
    return new Set([...dates].filter((iso) => validIso(iso) && !isSpecialDate(city, iso) && (iso < today || scheduled(city, iso))));
  }
  function normalizeForSave(city, dates) {
    return [...sanitizeDates(city, dates)].map(isoToKey).filter((v, i, a) => a.indexOf(v) === i).sort();
  }
  function requestId() { requestCounter += 1; return `CANCEL_${makeRequestId()}_${requestCounter}`; }
  function setStatus(message, state = "") {
    const el = $("cancelledVisitsStatus");
    if (el) { el.textContent = message; el.dataset.state = state; }
  }
  function setBusy(value) {
    busy = value;
    ["cancelledVisitsCity", "cancelledVisitsMonth", "cancelledVisitsRefreshButton", "cancelledVisitsSaveButton"].forEach((id) => { if ($(id)) $(id).disabled = value; });
    render();
  }
  function render() {
    const panel = $("cancelledVisitsPanel");
    if (!panel) return;
    const admin = !!(activeUser && activeUser.admin === true);
    panel.hidden = !admin;
    const citySelect = $("cancelledVisitsCity");
    if (citySelect && citySelect.options.length !== CITIES.length) {
      const old = citySelect.value;
      citySelect.replaceChildren();
      CITIES.forEach((city) => { const option = document.createElement("option"); option.value = city; option.textContent = city; citySelect.append(option); });
      if (CITIES.includes(old)) citySelect.value = old;
    }
    const city = citySelect?.value || CITIES[0];
    const month = $("cancelledVisitsMonth")?.value || monthIso(todayIso());
    const calendar = $("cancelledVisitsCalendar");
    if (!calendar) return;
    calendar.replaceChildren();
    const headings = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    headings.forEach((label) => { const h = document.createElement("span"); h.className = "cancelled-visits-weekday"; h.textContent = label; calendar.append(h); });
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const [year, mon] = month.split("-").map(Number);
    const first = new Date(Date.UTC(year, mon - 1, 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    for (let i = 0; i < offset; i++) { const empty = document.createElement("span"); empty.className = "cancelled-visits-empty"; calendar.append(empty); }
    for (let day = 1; day <= days; day++) {
      const iso = `${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const selected = selectedDates.has(iso);
      const past = iso < todayIso();
      const special = isSpecialDate(city, iso);
      const canAdd = !past && scheduled(city, iso) && !special && verified && !busy;
      const canRemove = selected && !special && verified && !busy;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cancelled-visits-day" + (selected ? " is-selected" : "") + (special ? " is-special" : "") + (past ? " is-past" : "");
      button.textContent = String(day);
      button.disabled = !(canAdd || canRemove);
      button.setAttribute("aria-pressed", String(selected));
      button.setAttribute("aria-label", `${iso}${selected ? ", selected for cancellation" : ""}${special ? ", Special Day Mode, not cancellable" : ""}`);
      button.addEventListener("click", () => {
        if (selected) selectedDates.delete(iso); else selectedDates.add(iso);
        dirty = true;
        render();
      });
      calendar.append(button);
    }
    const dates = [...selectedDates].sort();
    const summary = $("cancelledVisitsSelectionSummary");
    if (summary) summary.textContent = dates.length ? `Selected ${dates.length} date(s): ${dates.join(", ")}` : "No dates selected for this city.";
    const save = $("cancelledVisitsSaveButton");
    if (save) save.disabled = busy || !verified || !dirty;
    const refresh = $("cancelledVisitsRefreshButton");
    if (refresh) refresh.disabled = busy;
  }
  async function call(action, payload = {}) {
    if (!activeUser || activeUser.admin !== true) throw new Error("Administrator access is required.");
    const id = requestId();
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify({ action, requestId: id, ...payload, username: activeUser.username, password: activeUser.password, installationId: getInstallationId(), sessionId: activeUser.sessionId || "" }),
      cache: "no-store", redirect: "follow"
    });
    if (!response.ok) throw new Error(`Request failed (HTTP ${response.status}).`);
    const data = await response.json();
    if (data.ok !== true || data.requestId !== id || data.action !== action) throw new Error(data.error || "The response could not be verified.");
    return data;
  }
  async function refresh() {
    if (busy || !(activeUser && activeUser.admin === true)) return;
    setBusy(true); verified = false; setStatus("Retrieving and validating cancellation configuration…");
    try {
      const data = await call("getAppConfiguration");
      const raw = data.Doctor_Visit_Cancelled;
      if (!validConfig(raw)) throw new Error("Backend cancellation configuration is invalid or incomplete; existing selection was retained.");
      currentConfig = Object.fromEntries(CITIES.map((city) => [city, [...new Set(raw[city].map(String))].sort()]));
      const special = data.specialAccess || {};
      specialMode = { enabled: special.enabled === true, city: String(special.city || ""), date: String(special.date || "") };
      if (!dirty) selectedDates = sanitizeDates($("cancelledVisitsCity")?.value || CITIES[0], datesFor($("cancelledVisitsCity")?.value || CITIES[0]));
      verified = true;
      setStatus("Cancellation configuration refreshed and validated.", "success");
    } catch (error) {
      setStatus(error?.message || "Unable to refresh cancellation configuration. Retry.", "error");
    } finally { setBusy(false); }
  }
  async function save() {
    if (busy || !verified || !dirty || !(activeUser && activeUser.admin === true)) return;
    const city = $("cancelledVisitsCity")?.value || "";
    if (!CITIES.includes(city)) { setStatus("Choose a valid visiting city.", "error"); return; }
    const dates = normalizeForSave(city, selectedDates);
    if (dates.length !== selectedDates.size) { setStatus("Some selected dates are no longer eligible. Refresh and review the calendar.", "error"); return; }
    setBusy(true); setStatus(`Saving the complete cancellation-date list for ${city}…`);
    try {
      const data = await call("saveDoctorVisitCancelled", { city, dates });
      if (!validConfig(data.config)) throw new Error("Save response did not contain a valid complete cancellation configuration. Refresh before editing again.");
      const savedDates = [...new Set(data.config[city].map(String))].sort();
      if (JSON.stringify(savedDates) !== JSON.stringify(dates)) throw new Error("Backend acknowledged the save, but the returned dates differ from the requested selection. Refresh to verify.");
      currentConfig = Object.fromEntries(CITIES.map((name) => [name, [...new Set(data.config[name].map(String))].sort()]));
      selectedDates = datesFor(city);
      dirty = false;
      setStatus(dates.length ? `${city}: saved ${dates.length} cancelled visit date(s).` : `${city}: cancellation dates cleared.`, "success");
    } catch (error) {
      verified = false;
      setStatus(error?.message || "Save could not be verified. Refresh before retrying.", "error");
    } finally { setBusy(false); }
  }
  function initialize() {
    if (!(activeUser && activeUser.admin === true)) { render(); return; }
    const nextSession = `${activeUser.username || ""}|${activeUser.sessionId || ""}`;
    if (sessionKey && sessionKey !== nextSession) { verified = false; dirty = false; selectedDates = new Set(); currentConfig = null; }
    sessionKey = nextSession;
    if (!initialized) {
      initialized = true;
      $("cancelledVisitsCity")?.addEventListener("change", () => { dirty = false; if (verified) selectedDates = sanitizeDates($("cancelledVisitsCity").value, datesFor($("cancelledVisitsCity").value)); render(); });
      $("cancelledVisitsMonth")?.addEventListener("change", render);
      $("cancelledVisitsRefreshButton")?.addEventListener("click", refresh);
      $("cancelledVisitsSaveButton")?.addEventListener("click", save);
      if ($("cancelledVisitsMonth")) $("cancelledVisitsMonth").value = monthIso(todayIso());
    }
    render();
    if (!verified) refresh();
  }
  window.NeuronCancelledVisits = Object.freeze({ initialize, refresh });
})();
