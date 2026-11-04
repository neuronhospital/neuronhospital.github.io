/* Special Day Mode admin management. Backend remains authoritative for eligibility. */
(() => {
  "use strict";
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const ZONE = "Asia/Kolkata";
  const $ = (id) => document.getElementById(id);
  let busy = false;
  let verified = false;
  let activeCity = "";
  let activeDate = "";
  let requestCounter = 0;
  let initialized = false;
  let initializedSessionKey = "";

  function todayIso() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  function weekOfMonth(date) { return Math.floor((date.getDate() - 1) / 7) + 1; }
  function localDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); }
  function scheduledToday(city, iso) {
    const date = localDate(iso), day = date.getUTCDay(), week = weekOfMonth(date);
    switch (city) {
      case "Latur": return [1, 2, 3, 5, 6].includes(day) || ((day === 4 || day === 0) && week === 5);
      case "Nilanga": return day === 6 && week === 1;
      case "Udgir": return day === 0 && [2, 4].includes(week);
      case "Beed": return day === 4 && [2, 4].includes(week);
      case "Ambajogai": return day === 0 && [1, 3].includes(week);
      case "Dharashiv": return day === 4 && [1, 3].includes(week);
      case "Barshi": return day === 4 && [1, 3].includes(week);
      case "Omerga": return day === 6 && week >= 2 && week <= 5;
      default: return false;
    }
  }
  function eligibleCities(iso) { return CITIES.filter((city) => !scheduledToday(city, iso)); }
  function requestId() { requestCounter += 1; return `SDM_${makeRequestId()}_${requestCounter}`; }
  function setBusy(value) {
    busy = value;
    ["specialDayRefreshButton", "specialDayEnableButton", "specialDayDisableButton", "specialDayCity"].forEach((id) => { const el = $(id); if (el) el.disabled = value || (id === "specialDayEnableButton" && (!verified || !eligibleCities(todayIso()).length)); });
  }
  function status(message, kind = "") {
    const el = $("specialDayStatus");
    if (!el) return;
    el.textContent = message;
    el.dataset.state = kind;
  }
  function render() {
    const panel = $("specialDayModePanel");
    if (!panel) return;
    const admin = !!(activeUser && activeUser.admin === true);
    panel.hidden = !admin;
    const date = todayIso();
    const list = $("specialDayCity");
    if (list) {
      const candidates = eligibleCities(date);
      const previous = list.value;
      list.replaceChildren();
      candidates.forEach((city) => { const option = document.createElement("option"); option.value = city; option.textContent = city; list.appendChild(option); });
      if (candidates.includes(previous)) list.value = previous;
      else if (candidates.length) list.value = candidates[0];
    }
    const dateLabel = $("specialDayDate");
    if (dateLabel) dateLabel.textContent = new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: ZONE, day: "numeric", month: "long", year: "numeric" });
    const current = $("specialDayCurrent");
    if (current) current.textContent = verified && activeCity && activeDate === date ? `${activeCity} · ${activeDate}` : (verified ? "Disabled" : "Not verified");
    const disable = $("specialDayDisableButton");
    if (disable) disable.hidden = !(verified && activeCity && activeDate === date);
    const enable = $("specialDayEnableButton");
    if (enable) enable.disabled = busy || !verified || !eligibleCities(date).length || !list || !list.value;
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
  async function refresh(force = false) {
    if ((busy && !force) || !activeUser || activeUser.admin !== true) return;
    setBusy(true); verified = false; activeCity = ""; activeDate = "";
    status("Verifying current Special Day Mode…"); render();
    try {
      const data = await call("getSpecialDayAccessMode");
      if (typeof data.enabled !== "boolean" || typeof data.city !== "string" || typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Special Day Mode response is missing valid city/date/status fields.");
      activeDate = data.date;
      activeCity = data.enabled === true && data.date === todayIso() && eligibleCities(todayIso()).includes(data.city) ? data.city : "";
      verified = true;
      status(`Special Day Mode verified. Current state: ${activeCity ? `${activeCity} enabled for today` : "disabled"}.`, "success");
    } catch (error) {
      status(error && error.message ? error.message : "Unable to verify Special Day Mode. Retry.", "error");
    } finally { setBusy(false); render(); }
  }
  async function enable() {
    if (busy || !verified) return;
    const city = $("specialDayCity")?.value || "";
    const date = todayIso();
    if (!eligibleCities(date).includes(city)) { status("Select a city that is not already scheduled today.", "error"); return; }
    setBusy(true); status(`Enabling Special Day Mode for ${city}…`);
    try {
      const data = await call("setSpecialDayAccessMode", { city });
      if (data.enabled !== true || data.city !== city || data.date !== date) throw new Error(data.error || "The update was not confirmed for the selected city and today’s date.");
      await refresh(true);
      if (verified && activeCity === city) status(`Special Day Mode is enabled for ${city} today.`, "success");
      else status("The save was acknowledged, but the latest state did not verify as expected. Refresh before relying on it.", "error");
    } catch (error) { status(error?.message || "Unable to confirm the update. Refresh to verify current state.", "error"); await refresh(true); }
    finally { setBusy(false); render(); }
  }
  async function disable() {
    if (busy || !verified || !activeCity || activeDate !== todayIso()) return;
    setBusy(true); status("Disabling Special Day Mode…");
    try {
      const data = await call("disableSpecialDayAccessMode");
      if (data.enabled !== false) throw new Error(data.error || "Disable operation was not confirmed.");
      await refresh(true);
      if (verified && !activeCity) status("Special Day Mode has been disabled.", "success");
      else status("The operation was acknowledged, but the current state changed. Refresh and verify.", "error");
    } catch (error) { status(error?.message || "Unable to confirm disable operation. Refresh to verify.", "error"); await refresh(true); }
    finally { setBusy(false); render(); }
  }
  function initialize() {
    if (!(activeUser && activeUser.admin === true)) { render(); return; }
    const sessionKey = `${activeUser.username || ""}|${activeUser.sessionId || ""}`;
    if (initializedSessionKey && initializedSessionKey !== sessionKey) verified = false;
    initializedSessionKey = sessionKey;
    render();
    if (!initialized) {
      initialized = true;
      if ($("specialDayRefreshButton")) $("specialDayRefreshButton").addEventListener("click", refresh);
      if ($("specialDayEnableButton")) $("specialDayEnableButton").addEventListener("click", enable);
      if ($("specialDayDisableButton")) $("specialDayDisableButton").addEventListener("click", disable);
      if ($("specialDayCity")) $("specialDayCity").addEventListener("change", render);
    }
    if (!verified) refresh();
  }
  window.NeuronSpecialDayMode = Object.freeze({ initialize, render, refresh });

})();
