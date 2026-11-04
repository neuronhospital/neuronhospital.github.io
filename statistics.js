(function (root) {
  "use strict";
  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const PERIODS = [
    ["today", "Today"], ["yesterday", "Yesterday"], ["daybefore", "Day Before Yesterday"],
    ["currentmonth", "Current Month"], ["previousmonth", "Previous Month"], ["month2", "2 Months Ago"], ["month3", "3 Months Ago"],
    ["last12", "Last 12 Months"], ["currentyear", "Current Year"], ["lastyear", "Last Year"],
    ["year2", "2 Years Ago"], ["year3", "3 Years Ago"], ["year4", "4 Years Ago"], ["year5", "5 Years Ago"], ["last5", "Last 5 Years"]
  ];
  let initialized = false, loading = false, currentResult = null, requestSequence = 0;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = value => "₹" + (Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
  function status(message, error) { const el = $("statisticsStatus"); if (el) { el.textContent = message; el.classList.toggle("is-error", !!error); } }
  function canHistory() { return !!(root.activeUser && root.activeUser.admin === true); }
  function populate() {
    const city = $("statisticsCity"), period = $("statisticsPeriod"); if (!city || !period) return;
    const user = root.activeUser || {};
    const allowed = canHistory() ? [["All", "All City Combined"], ...CITIES.map(c => [c,c])] : [[user.city || "Latur", user.city || "Latur"]];
    city.innerHTML = allowed.map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
    period.innerHTML = PERIODS.filter(([v]) => canHistory() || v === "today").map(([v,l]) => `<option value="${v}">${esc(l)}</option>`).join("");
    if (!canHistory()) period.value = "today";
  }
  function rowValue(row, keys) {
    if (!row || typeof row !== "object") return "";
    for (const key of keys) {
      if (row[key] != null && String(row[key]).trim() !== "") return row[key];
    }
    return "";
  }
  function patientType(row) {
    return String(rowValue(row, ["patientType", "type", "opdType", "visitType"])).toLowerCase().replace(/[\s_-]+/g, "");
  }
  function isNew(row) { return /^(new|newpatient|firstvisit)$/.test(patientType(row)); }
  function isFollowup(row) { return /^(followup|followupvisit|review|old)$/.test(patientType(row)); }
  function cityOf(row) { return String(rowValue(row, ["city", "visitingCity", "opdCity"]) || "Unknown").trim() || "Unknown"; }
  function dateOf(row) {
    const raw = rowValue(row, ["visitingDate", "appointmentDate", "opdDate", "visitDate", "date"]);
    if (!raw) return "";
    const value = String(raw).trim();
    let m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
    m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
    return "";
  }
  function amount(row, keys) {
    const value = rowValue(row, keys);
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  function opdRowAmounts(row) {
    const cash = amount(row, ["opdCashPaid", "opdCash", "cashPaid"]);
    const online = amount(row, ["opdOnlinePaid", "opdOnline", "onlinePaid"]);
    const refund = amount(row, ["opdRefund", "opdRefundAmount"]);
    return { cash, online, paid: cash + online, refund, net: cash + online - refund };
  }
  function renderBreakdown(containerId, entries, emptyMessage, dateMode) {
    const el = $(containerId); if (!el) return;
    if (!entries.length) { el.innerHTML = `<p class="statistics-empty">${esc(emptyMessage)}</p>`; return; }
    const headers = dateMode ? ["Date", "OPD", "New", "Follow-up", "Net"] : ["City", "OPD", "New", "Follow-up", "Cash", "Online", "Refund", "Net"];
    const rows = entries.map(item => {
      const cells = dateMode
        ? [item.key, item.count, item.newCount, item.followupCount, money(item.net)]
        : [item.key, item.count, item.newCount, item.followupCount, money(item.cash), money(item.online), money(item.refund), money(item.net)];
      return `<tr>${cells.map((v,i)=>`<td${i ? ' class="num"' : ""}>${esc(v)}</td>`).join("")}</tr>`;
    }).join("");
    el.innerHTML = `<table class="statistics-breakdown-table"><thead><tr>${headers.map((h,i)=>`<th${i ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderOpdBreakdowns(result) {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const cityMap = new Map(), dateMap = new Map();
    rows.forEach(row => {
      if (!row || typeof row !== "object") return;
      const typeNew = isNew(row), typeFollow = isFollowup(row), a = opdRowAmounts(row);
      const city = cityOf(row);
      if (!cityMap.has(city)) cityMap.set(city, { key: city, count: 0, newCount: 0, followupCount: 0, cash: 0, online: 0, refund: 0, net: 0 });
      const c = cityMap.get(city); c.count++; c.newCount += typeNew ? 1 : 0; c.followupCount += typeFollow ? 1 : 0; c.cash += a.cash; c.online += a.online; c.refund += a.refund; c.net += a.net;
      const date = dateOf(row);
      if (date) {
        if (!dateMap.has(date)) dateMap.set(date, { key: date, count: 0, newCount: 0, followupCount: 0, cash: 0, online: 0, refund: 0, net: 0 });
        const d = dateMap.get(date); d.count++; d.newCount += typeNew ? 1 : 0; d.followupCount += typeFollow ? 1 : 0; d.cash += a.cash; d.online += a.online; d.refund += a.refund; d.net += a.net;
      }
    });
    const cities = [...cityMap.values()].sort((a,b) => a.key.localeCompare(b.key));
    const dates = [...dateMap.values()].sort((a,b) => b.key.localeCompare(a.key));
    renderBreakdown("statisticsCityBreakdown", cities, rows.length ? "No city breakdown available." : "No patient-level records were returned for city breakdown.", false);
    renderBreakdown("statisticsDateBreakdown", dates, rows.length ? "The retrieved rows do not include a recognized visit-date field." : "No patient-level records were returned for date breakdown.", true);
  }
  function render(result) {
    currentResult = result;
    const totals = result.totals || {};
    const metrics = [
      ["Patients", totals.patientCount], ["New OPD", totals.opdNew], ["Follow-up OPD", totals.opdFollowup], ["EEG", totals.eegCount],
      ["OPD Paid", money(totals.opdPaid)], ["EEG Paid", money(totals.eegPaid)], ["Collection", money(totals.totalCollection)], ["Net Total", money(totals.netTotal)]
    ];
    $("statisticsSummary").innerHTML = metrics.map(([label,value]) => `<article class="statistics-metric"><span>${esc(label)}</span><strong>${esc(value == null ? 0 : value)}</strong></article>`).join("");
    $("statisticsHeading").textContent = `${result.city || "Selected City"} · ${result.periodLabel || result.period || "Statistics"}`;
    const opdMetrics = [
      ["OPD Patients", totals.patientCount], ["New", totals.opdNew], ["Follow-up", totals.opdFollowup], ["Free OPD", totals.freeOPD],
      ["OPD Cash", money(totals.opdCash)], ["OPD Online", money(totals.opdOnline)], ["OPD Paid", money(totals.opdPaid)], ["OPD Refund", money(totals.opdRefund)],
      ["OPD Net", money(Number(totals.opdPaid || 0) - Number(totals.opdRefund || 0))]
    ];
    const opdMetricsEl = $("statisticsOpdMetrics");
    if (opdMetricsEl) opdMetricsEl.innerHTML = opdMetrics.map(([label,value]) => `<article class="statistics-opd-metric"><span>${esc(label)}</span><strong>${esc(value == null ? 0 : value)}</strong></article>`).join("");
    renderOpdBreakdowns(result);
    const bars = [["OPD cash",totals.opdCash], ["OPD online",totals.opdOnline], ["EEG cash",totals.eegCash], ["EEG online",totals.eegOnline], ["Refund",totals.totalRefund]];
    const max = Math.max(1, ...bars.map(([,v]) => Number(v || 0)));
    $("statisticsChart").innerHTML = bars.map(([label,value]) => `<div class="statistics-bar-row"><span>${esc(label)}</span><div class="statistics-bar-track"><i style="width:${Math.max(0,Math.min(100,Number(value || 0)/max*100))}%"></i></div><b>${esc(money(value))}</b></div>`).join("");
    const sourceCities = Array.isArray(result.sourceCities) ? result.sourceCities.join(", ") : "";
    $("statisticsSource").textContent = `${result.source || "Server"}${sourceCities ? " · Included cities: " + sourceCities : ""}`;
    $("statisticsResult").hidden = false;
    status(`Loaded ${Number(totals.patientCount || 0)} patient record(s).`);
  }
  function parseResult(data, requestedCity, requestedPeriod) {
    const result = data.result && typeof data.result === "object" ? data.result : data;
    const totals = result.totals && typeof result.totals === "object" ? result.totals : {};
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const numericKeys = ["patientCount","opdNew","opdFollowup","freeOPD","eegCount","freeEEG","opdCash","opdOnline","opdPaid","opdRefund","eegCash","eegOnline","eegPaid","eegRefund","totalCash","totalOnline","totalCollection","totalRefund","netCash","netOnline","netTotal"];
    const normalizedTotals = {}; numericKeys.forEach(k => normalizedTotals[k] = Number(totals[k] || 0));
    return { city: String(result.city || requestedCity), period: String(result.period || requestedPeriod), periodLabel: String(result.periodLabel || requestedPeriod), totals: normalizedTotals, rows, sourceCities: Array.isArray(result.sourceCities) ? result.sourceCities : [], source: String(result.source || "") };
  }
  async function post(payload, timeout = 30000) {
    const response = await root.fetchWithTimeout(root.BACKEND_URL, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8","Cache-Control":"no-cache"}, body:JSON.stringify(payload), cache:"no-store", redirect:"follow" }, timeout);
    if (!response.ok) throw new Error(`Backend request failed (HTTP ${response.status}).`);
    const data = await response.json(); if (!data || typeof data !== "object") throw new Error("Unreadable Statistics response."); return data;
  }
  function serverPeriod(period) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit" }).formatToParts(now);
    const year = Number(parts.find(p => p.type === "year").value), month = Number(parts.find(p => p.type === "month").value);
    const target = new Date(Date.UTC(year, month - 1, 1));
    if (period === "currentmonth") return `${year}-${String(month).padStart(2,"0")}`;
    if (["previousmonth","month2","month3"].includes(period)) { target.setUTCMonth(target.getUTCMonth() - ({previousmonth:1,month2:2,month3:3}[period])); return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,"0")}`; }
    if (period === "currentyear") return "currentyear";
    if (period === "lastyear") return "lastyear";
    if (["year2","year3","year4","year5"].includes(period)) return String(year - Number(period.slice(4)));
    return period;
  }
  function authPayload() {
    const u = root.activeUser || {};
    return { username:u.username, password:u.password, sessionId:u.sessionId || u.loginRequestId || "", installationId:typeof root.getInstallationId === "function" ? root.getInstallationId() : "", sourceFcmToken:"" };
  }
  async function load(forceRefresh) {
    if (loading || !root.activeUser) return;
    const seq = ++requestSequence; loading = true;
    const city = $("statisticsCity").value, period = $("statisticsPeriod").value;
    const selectedCities = city === "All" ? CITIES.slice() : [city];
    $("statisticsRefresh").disabled = true; $("statisticsInstant").disabled = true; $("statisticsResult").hidden = true;
    status(forceRefresh ? "Refreshing Statistics…" : "Loading Statistics…");
    try {
      const requestId = typeof root.makeRequestId === "function" ? root.makeRequestId() : `ST_${Date.now()}`;
      const start = await post({ action:"startStatisticsRetrieval", ...authPayload(), requestId, city, period:serverPeriod(period), showMode:"both", selectedCities, forceRefresh:!!forceRefresh }, 30000);
      if (seq !== requestSequence) return;
      if (!start.ok) throw new Error(start.error || "Unable to start Statistics retrieval.");
      const retrievalKey = String(start.retrievalKey || "");
      if (!retrievalKey) throw new Error("Statistics retrieval key is missing.");
      if (start.status === "COMPLETED" && start.result) { render(parseResult(start, city, period)); return; }
      status("Statistics retrieval is running…");
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (seq !== requestSequence) return;
        const state = await post({ action:"getStatisticsRetrievalStatus", ...authPayload(), retrievalKey }, 20000);
        if (state.status === "COMPLETED") { render(parseResult(state, city, period)); return; }
        if (state.status === "FAILED" || state.status === "NOT_FOUND") throw new Error(state.error || "Statistics retrieval failed.");
      }
      throw new Error("Statistics retrieval is taking longer than expected. Refresh to check again.");
    } catch (error) { if (seq === requestSequence) status(error && error.message ? error.message : "Unable to load Statistics.", true); }
    finally { if (seq === requestSequence) { loading = false; $("statisticsRefresh").disabled = false; $("statisticsInstant").disabled = false; } }
  }
  function exportValue(row, keys, fallback = "") {
    const value = rowValue(row, keys);
    return value == null || String(value).trim() === "" ? fallback : value;
  }
  function exportNumber(row, keys) {
    const n = Number(exportValue(row, keys, 0));
    return Number.isFinite(n) ? n : 0;
  }
  function exportEegPresent(row) {
    const explicit = exportValue(row, ["eegPresent", "hasEEG", "eegBooked"], null);
    if (explicit !== null) return explicit === true || /^(true|1|yes)$/i.test(String(explicit));
    return ["eegCharges", "eegCashPaid", "eegOnlinePaid", "eegCash", "eegOnline", "eegTotalPaid"]
      .some(key => row && row[key] != null && String(row[key]).trim() !== "");
  }
  function csvCell(value) {
    return `"${String(value == null ? "" : value).replace(/"/g, '""')}"`;
  }
  function reportFileBase(result) {
    const safe = value => String(value || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `NEURON_${safe(result.city) || "All"}_${safe(result.periodLabel) || "report"}`;
  }
  function downloadText(filename, content, mime) {
    if (!currentResult || !Array.isArray(currentResult.rows)) {
      status("Load Statistics before exporting a report.", true); return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCsv() {
    if (!currentResult) { status("Load Statistics before exporting a report.", true); return; }
    const result = currentResult, allCity = String(result.city).toLowerCase() === "all";
    const lines = [[`${result.city} - ${result.periodLabel}`]];
    lines.push(allCity
      ? ["Sr No.", "Patient Name", "City", "OPD Cash", "OPD Online", "OPD Total", "EEG Cash", "EEG Online", "EEG Total", "Mobile Number"]
      : ["Sr No.", "Patient Name", "OPD Cash", "OPD Online", "OPD Total", "EEG Cash", "EEG Online", "EEG Total", "Mobile Number"]);
    result.rows.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const patientName = exportValue(row, ["patientName", "name", "patient"]);
      const city = exportValue(row, ["city", "visitingCity", "opdCity"], result.city);
      const opdCash = exportNumber(row, ["opdCashPaid", "opdCash", "cashPaid"]);
      const opdOnline = exportNumber(row, ["opdOnlinePaid", "opdOnline", "onlinePaid"]);
      const eegPresent = exportEegPresent(row);
      const eegCash = exportNumber(row, ["eegCashPaid", "eegCash"]);
      const eegOnline = exportNumber(row, ["eegOnlinePaid", "eegOnline"]);
      const mobile = exportValue(row, ["mobileNumber", "whatsappNumber", "phone", "mobile"]);
      const values = allCity
        ? [index + 1, patientName, city, opdCash, opdOnline, opdCash + opdOnline, eegPresent ? eegCash : "", eegPresent ? eegOnline : "", eegPresent ? eegCash + eegOnline : "", mobile]
        : [index + 1, patientName, opdCash, opdOnline, opdCash + opdOnline, eegPresent ? eegCash : "", eegPresent ? eegOnline : "", eegPresent ? eegCash + eegOnline : "", mobile];
      lines.push(values);
    });
    const content = "\uFEFF" + lines.map(line => line.map(csvCell).join(",")).join("\r\n");
    downloadText(`${reportFileBase(result)}_both.csv`, content, "text/csv;charset=utf-8");
  }
  function normalizeIndianMobile(raw) {
    const digits = String(raw == null ? "" : raw).replace(/\D/g, "");
    const national = /^91\d{10}$/.test(digits) ? digits.slice(2) : /^0\d{10}$/.test(digits) ? digits.slice(1) : /^\d{10}$/.test(digits) ? digits : "";
    return national.length === 10 ? national : "";
  }
  function exportMobileList() {
    if (!currentResult) { status("Load Statistics before exporting a report.", true); return; }
    const rows = currentResult.rows.map(row => {
      const mobileNumber = normalizeIndianMobile(exportValue(row, ["mobileNumber", "whatsappNumber", "phone", "mobile"]));
      const nextFollowupCity = String(exportValue(row, ["nextFollowupCity", "nextFollowUpCity", "followupCity"])).trim();
      return mobileNumber && nextFollowupCity ? { mobileNumber, nextFollowupCity } : null;
    }).filter(Boolean).sort((a,b) => a.nextFollowupCity.toLowerCase().localeCompare(b.nextFollowupCity.toLowerCase()) || a.nextFollowupCity.localeCompare(b.nextFollowupCity));
    const content = rows.map(row => `${row.mobileNumber} ${row.nextFollowupCity}`).join("\r\n");
    downloadText(`${reportFileBase(currentResult)}_Mobile_Number.txt`, content, "text/plain;charset=utf-8");
    if (!rows.length) status("No valid mobile number and Next Follow-up City pairs were found to export.");
  }
  function initialize() {
    if (!initialized) {
      initialized = true; populate();
      $("statisticsCity").addEventListener("change", () => { currentResult = null; load(false); });
      $("statisticsPeriod").addEventListener("change", () => { currentResult = null; load(false); });
      $("statisticsRefresh").addEventListener("click", () => load(true));
      $("statisticsExportCsv").addEventListener("click", exportCsv);
      $("statisticsExportMobile").addEventListener("click", exportMobileList);
      $("statisticsInstant").addEventListener("click", () => { $("statisticsPeriod").value = "today"; load(false); });
      $("statisticsBackButton").addEventListener("click", () => root.setView("home"));
    }
    populate(); load(false);
  }
  root.initializeStatisticsFeature = initialize;
})(window);
