/* Phase 8.2 — searchable PreBooking patient list and patient selection. */
(function (root) {
  "use strict";

  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const ZONE = "Asia/Kolkata";
  let initialized = false;
  let loading = false;
  let loadSequence = 0;
  let records = [];
  let selectedAppointmentId = "";
  let permittedCities = [];
  let activeSlice = { city: "", date: "" };
  let refreshTimer = null;
  const SYNC_INTERVAL_MS = 60 * 60 * 1000;
  const DAYTIME_START_HOUR = 7;
  const DAYTIME_END_HOUR = 22;

  const $ = (id) => document.getElementById(id);

  function normalizeCity(value) {
    return root.NeuronCore ? root.NeuronCore.normalizeCity(value) : String(value || "").trim();
  }

  function dateKeyFromInput(value) {
    const iso = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const date = new Date(iso + "T00:00:00Z");
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? "" : iso.replace(/-/g, "");
  }

  function todayIso() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function dateLabel(raw) {
    const value = String(raw || "").trim();
    let date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) date = new Date(value + "T00:00:00Z");
    else if (/^\d{8}$/.test(value)) date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
    if (!date || Number.isNaN(date.getTime())) return value || "Not available";
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: ZONE }).format(date);
  }

  function permittedCityList() {
    const user = typeof activeUser !== "undefined" ? activeUser : null;
    if (!user) return [];
    if (user.admin === true || normalizeCity(user.city) === "Latur") return CITIES.slice();
    const assigned = normalizeCity(user.city);
    return CITIES.includes(assigned) ? [assigned] : [];
  }

  function fillCityFilter(preserve = true) {
    const select = $("prebookingListCity");
    if (!select) return;
    const previous = preserve ? select.value : "";
    permittedCities = permittedCityList();
    select.replaceChildren();
    permittedCities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city;
      option.textContent = city;
      select.append(option);
    });
    select.value = permittedCities.includes(previous) ? previous : permittedCities[0] || "";
    select.disabled = permittedCities.length <= 1;
  }

  function validateRecords(response, city, visitingDate) {
    if (!response || response.ok !== true || response.operation !== "getPendingPreBookings" ||
        response.city !== city || response.visitingDate !== visitingDate) {
      throw new Error(String(response && response.error || "The server response did not match the selected city/date."));
    }
    const rows = response.records;
    if (!Array.isArray(rows)) throw new Error("The backend response did not contain a patient list.");
    if (response.count != null && Number(response.count) !== rows.length) throw new Error("The patient count did not match the returned records.");
    const seen = new Set();
    return rows.map((row) => {
      if (!row || typeof row !== "object") throw new Error("A patient record was malformed.");
      const appointmentId = String(row.appointmentId || "").trim();
      const requestId = String(row.prebookingRequestId || "").trim();
      const patientName = String(row.patientName || "").trim();
      if (!appointmentId || !new RegExp(`^PB-${city}-${visitingDate}-\\d{2,}$`).test(appointmentId)) {
        throw new Error("A patient appointment identity was invalid.");
      }
      if (!/^[A-Za-z0-9_-]{8,120}$/.test(requestId) || !patientName || seen.has(appointmentId)) {
        throw new Error("A patient request identity was invalid or duplicated.");
      }
      seen.add(appointmentId);
      return {
        appointmentId,
        prebookingRequestId: requestId,
        prebookingDate: String(row.prebookingDate || "").trim(),
        bookingTime: String(row.bookingTime || "").trim(),
        patientName,
        age: String(row.age || "").trim(),
        address: String(row.address || "").trim(),
        mobileNumber: String(row.mobileNumber || "").trim(),
        city,
        visitingDate
      };
    });
  }

  function requestPayload(city, visitingDate) {
    const user = typeof activeUser !== "undefined" ? activeUser : null;
    if (!user || !user.username || !user.password) throw new Error("Login is required to view PreBooking patients.");
    return {
      action: "getPendingPreBookings",
      visitingCity: city,
      visitingDate,
      username: user.username,
      password: user.password,
      sessionId: user.sessionId || "",
      installationId: typeof getInstallationId === "function" ? getInstallationId() : "",
      sourceFcmToken: ""
    };
  }

  function cacheCity(city) {
    const user = typeof activeUser !== "undefined" && activeUser ? String(activeUser.username || "") : "";
    let hash = 2166136261;
    for (let i = 0; i < user.length; i++) { hash ^= user.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `${city}::user-${(hash >>> 0).toString(36)}`;
  }

  function canRunBackgroundRefresh() {
    if (!root.document || root.document.visibilityState === "hidden" || !root.navigator || root.navigator.onLine === false) return false;
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    return hour >= DAYTIME_START_HOUR && hour < DAYTIME_END_HOUR;
  }

  async function readCachedSlice(city, date) {
    const storage = root.NeuronStorage;
    if (!storage || typeof storage.getRecords !== "function" || typeof storage.getSyncState !== "function") return null;
    const scopedCity = cacheCity(city);
    const [saved, state] = await Promise.all([
      storage.getRecords({ scope: "prebooking", city: scopedCity, date }),
      storage.getSyncState({ scope: "prebooking", city: scopedCity, date })
    ]);
    const cached = Array.isArray(saved) ? saved.map((item) => item.data).filter((row) => row && row.appointmentId) : [];
    return { records: cached, state };
  }

  async function writeCachedSlice(city, date, next, response) {
    const storage = root.NeuronStorage;
    if (!storage || typeof storage.replaceSlice !== "function") return null;
    const scopedCity = cacheCity(city);
    const version = Number(response && (response.syncVersion ?? response.syncVersionNumber ?? response.version));
    const recordsToSave = next.map((row) => ({
      recordId: row.appointmentId,
      data: row,
      status: "current",
      updatedAt: Date.now()
    }));
    return storage.replaceSlice({
      scope: "prebooking", city: scopedCity, date, records: recordsToSave,
      completedAt: Date.now(), syncVersion: Number.isFinite(version) && version >= 0 ? version : null
    });
  }

  function isCacheFresh(state) {
    return !!state && state.status === "complete" && Number.isFinite(Number(state.lastSuccessAt)) &&
      Date.now() - Number(state.lastSuccessAt) >= 0 && Date.now() - Number(state.lastSuccessAt) < SYNC_INTERVAL_MS;
  }

  async function loadRecords(force = false, options = {}) {
    const sequence = ++loadSequence;
    const city = $("prebookingListCity").value;
    const date = dateKeyFromInput($("prebookingListDate").value);
    activeSlice = { city, date };
    if (!permittedCities.includes(city)) {
      loading = false;
      setStatus("Choose a city permitted for this account.", true);
      records = [];
      render();
      return;
    }
    if (!date) {
      loading = false;
      setStatus("Select a valid visiting date.", true);
      records = [];
      render();
      return;
    }

    const refresh = $("prebookingPatientsRefresh");
    if (!options.background) {
      loading = true;
      refresh.disabled = true;
      refresh.textContent = "Syncing…";
    }
    try {
      // Render local IndexedDB data immediately; a failed server refresh must not erase it.
      const cached = await readCachedSlice(city, date).catch(() => null);
      if (sequence !== loadSequence || city !== $("prebookingListCity").value || date !== dateKeyFromInput($("prebookingListDate").value)) return;
      if (cached && cached.state) {
        records = cached.records;
        if (!records.some((row) => row.appointmentId === selectedAppointmentId)) selectedAppointmentId = "";
        const stale = !isCacheFresh(cached.state) || cached.state.status === "stale";
        setStatus(`Showing ${stale ? "saved (possibly stale)" : "cached"} records for ${city} · ${dateLabel(date)}.`, false);
        render();
        if (!force && isCacheFresh(cached.state)) {
          if (!options.background) setStatus(`Cache is current for ${city} · ${dateLabel(date)}. Next refresh is due in up to 1 hour.`, false);
          return;
        }
      }

      if (root.navigator && root.navigator.onLine === false) {
        if (!cached || !cached.state) records = [];
        setStatus(cached && cached.state ? "Offline — showing saved PreBooking records. They may be stale." : "Offline and no saved records are available for this city/date.", !cached || !cached.state);
        render();
        return;
      }

      const request = () => fetchWithTimeout(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
        body: JSON.stringify(requestPayload(city, date)),
        cache: "no-store",
        redirect: "follow"
      }, 35000);
      const coordinated = root.NeuronSyncCoordinator
        ? await root.NeuronSyncCoordinator.run(`prebooking:${cacheCity(city)}:${date}`, request, { waitForLeaseMs: 15000 })
        : { status: "SUCCESS", result: await request() };
      if (coordinated.status !== "SUCCESS" || !coordinated.result) throw new Error("PreBooking synchronization is already running in another tab. Retry shortly.");
      const response = coordinated.result;
      if (!response.ok) throw new Error(`Backend request failed (HTTP ${response.status}).`);
      let body;
      try { body = await response.json(); } catch (_) { throw new Error("The backend returned an unreadable patient list."); }
      const next = validateRecords(body, city, date);
      if (sequence !== loadSequence || city !== $("prebookingListCity").value || date !== dateKeyFromInput($("prebookingListDate").value)) return;
      // Commit only a fully validated response as an atomic city/date snapshot.
      await writeCachedSlice(city, date, next, body).catch((error) => {
        console.warn("PreBooking local cache update failed:", error);
      });
      if (sequence !== loadSequence) return;
      records = next;
      if (!records.some((row) => row.appointmentId === selectedAppointmentId)) selectedAppointmentId = "";
      const version = body.syncVersion ?? body.syncVersionNumber ?? body.version;
      setStatus(`Server sync complete · ${city} · ${dateLabel(date)}${version != null ? ` · version ${version}` : ""}${force ? " · refreshed" : ""}.`, false);
      render();
    } catch (error) {
      if (sequence === loadSequence) {
        const cache = await readCachedSlice(city, date).catch(() => null);
        if (!cache || !cache.state) {
          records = [];
          selectedAppointmentId = "";
        } else {
          records = cache.records;
          if (!records.some((row) => row.appointmentId === selectedAppointmentId)) selectedAppointmentId = "";
          await root.NeuronStorage?.markSliceStale?.({ scope: "prebooking", city: cacheCity(city), date, reason: String(error && error.message || "Sync failed") }).catch(() => {});
        }
        setStatus(cache && cache.state ? `Sync failed — showing saved records${records.length ? "" : " (empty snapshot)"}. ${error && error.message ? error.message : "Try refresh again."}` : (error && error.message ? error.message : "Unable to load PreBooking patients."), !(cache && cache.state));
        render();
      }
    } finally {
      if (sequence === loadSequence && !options.background) {
        loading = false;
        refresh.disabled = false;
        refresh.textContent = "Refresh records";
      }
    }
  }

  function scheduleBackgroundRefresh() {
    if (refreshTimer) root.clearInterval(refreshTimer);
    refreshTimer = root.setInterval(() => {
      if (canRunBackgroundRefresh() && activeSlice.city && activeSlice.date) {
        loadRecords(false, { background: true });
      }
    }, SYNC_INTERVAL_MS);
  }

  function setStatus(message, isError) {
    const status = $("prebookingListStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", !!isError);
  }

  function filteredSortedRecords() {
    const term = $("prebookingListSearch").value.trim().toLocaleLowerCase("en-IN");
    const sort = $("prebookingListSort").value;
    const result = records.filter((row) => {
      if (!term) return true;
      return [row.patientName, row.mobileNumber, row.appointmentId, row.prebookingRequestId, row.address]
        .some((value) => String(value || "").toLocaleLowerCase("en-IN").includes(term));
    });
    result.sort((a, b) => {
      if (sort === "name-asc") return a.patientName.localeCompare(b.patientName, "en-IN");
      if (sort === "name-desc") return b.patientName.localeCompare(a.patientName, "en-IN");
      const left = `${a.prebookingDate} ${a.bookingTime}`;
      const right = `${b.prebookingDate} ${b.bookingTime}`;
      return sort === "time-asc" ? left.localeCompare(right) : right.localeCompare(left);
    });
    return result;
  }

  function detailRows(row) {
    return [
      ["Patient name", row.patientName], ["Age", row.age || "Not available"],
      ["Address", row.address || "Not available"], ["WhatsApp / Mobile", row.mobileNumber || "Not available"],
      ["PreBooking status", "Pending final OPD appointment"],
      ["Visiting city", row.city], ["Visiting date", dateLabel(row.visitingDate)],
      ["PreBooking date", dateLabel(row.prebookingDate)], ["Booking time", row.bookingTime || "Not available"],
      ["Appointment ID", row.appointmentId], ["PreBooking Request ID", row.prebookingRequestId]
    ];
  }

  function renderDetails(row) {
    const panel = $("prebookingPatientDetails");
    const grid = $("prebookingPatientDetailGrid");
    if (!row) { panel.hidden = true; grid.replaceChildren(); return; }
    panel.hidden = false;
    $("prebookingPatientDetailSubtitle").textContent = `${row.city} · ${dateLabel(row.visitingDate)}`;
    grid.replaceChildren();
    detailRows(row).forEach(([label, value]) => {
      const item = document.createElement("div");
      const key = document.createElement("span"); key.textContent = label;
      const text = document.createElement("strong"); text.textContent = value;
      item.append(key, text); grid.append(item);
    });
  }

  function render() {
    const container = $("prebookingPatientCards");
    if (!container) return;
    container.replaceChildren();
    const visible = filteredSortedRecords();
    $("prebookingListCount").textContent = `${visible.length} of ${records.length} patients`;
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "prebooking-list-empty";
      empty.textContent = records.length ? "No patients match the search." : "No PreBooking patients are available for this city and date.";
      container.append(empty);
    }
    visible.forEach((row, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prebooking-patient-card" + (row.appointmentId === selectedAppointmentId ? " selected" : "");
      button.setAttribute("aria-pressed", String(row.appointmentId === selectedAppointmentId));
      const number = document.createElement("span"); number.className = "prebooking-patient-card-number"; number.textContent = String(index + 1);
      const copy = document.createElement("span"); copy.className = "prebooking-patient-card-copy";
      const name = document.createElement("strong"); name.textContent = `${row.patientName}${row.age ? `, ${row.age}` : ""}`;
      const meta = document.createElement("span"); meta.textContent = `Booking date: ${dateLabel(row.prebookingDate)}${row.bookingTime ? ` · ${row.bookingTime}` : ""}`;
      const id = document.createElement("span"); id.textContent = row.appointmentId;
      copy.append(name, meta, id); button.append(number, copy);
      button.addEventListener("click", () => {
        selectedAppointmentId = selectedAppointmentId === row.appointmentId ? "" : row.appointmentId;
        render();
      });
      container.append(button);
    });
    renderDetails(records.find((row) => row.appointmentId === selectedAppointmentId) || null);
  }

  function initialize() {
    if (initialized) { fillCityFilter(true); loadRecords(); return; }
    if (!$ ("prebookingPatientCards")) return;
    initialized = true;
    fillCityFilter(false);
    $("prebookingListDate").value = todayIso();
    $("prebookingPatientsRefresh").addEventListener("click", () => loadRecords(true));
    $("prebookingListCity").addEventListener("change", () => { selectedAppointmentId = ""; loadRecords(); });
    $("prebookingListDate").addEventListener("change", () => { selectedAppointmentId = ""; loadRecords(); });
    $("prebookingListSearch").addEventListener("input", render);
    $("prebookingListSort").addEventListener("change", render);
    $("prebookingPatientClearSelection").addEventListener("click", () => { selectedAppointmentId = ""; render(); });
    $("prebookingUseForOpdButton").addEventListener("click", () => {
      const row = records.find((item) => item.appointmentId === selectedAppointmentId);
      if (!row) {
        setStatus("Select a verified PreBooking patient first.", true);
        return;
      }
      if (typeof root.prefillOpdFromPreBooking !== "function") {
        setStatus("OPD booking handoff is unavailable. Reload the website and try again.", true);
        return;
      }
      root.prefillOpdFromPreBooking(row);
    });
    loadRecords();
    scheduleBackgroundRefresh();
    root.document.addEventListener("visibilitychange", () => {
      if (canRunBackgroundRefresh() && activeSlice.city && activeSlice.date) loadRecords(false, { background: true });
    });
    root.addEventListener("online", () => {
      if (activeSlice.city && activeSlice.date) loadRecords(false, { background: true });
    });
  }

  root.initializePreBookingPatientList = initialize;
  root.refreshPreBookingPatientList = () => initialized && loadRecords(true);
})(typeof window !== "undefined" ? window : globalThis);
