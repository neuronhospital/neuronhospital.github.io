/* Follow-up city cache: IndexedDB persistence, sync state and recoverable refresh. */
(function () {
  "use strict";
  const DB_NAME = "neuron-followup-cache-v1";
  const DB_VERSION = 1;
  const RECORDS = "records";
  const STATES = "states";
  const CACHE_VERSION = "1";
  const ZONE = "Asia/Kolkata";
  let dbPromise;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("This browser does not support the Follow-up local cache."));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains(RECORDS)) {
          const store = d.createObjectStore(RECORDS, { keyPath: ["account", "city", "sourceRow"] });
          store.createIndex("accountCity", ["account", "city"], { unique: false });
        }
        if (!d.objectStoreNames.contains(STATES)) d.createObjectStore(STATES, { keyPath: ["account", "city"] });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open Follow-up cache."));
      request.onblocked = () => reject(new Error("Follow-up cache upgrade is blocked by another tab."));
    });
    return dbPromise;
  }
  function account() {
    const u = typeof activeUser !== "undefined" ? activeUser : null;
    return String(u && (u.username || u.userName) || "anonymous").trim().toLowerCase();
  }
  function todayKey() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const val = (type) => parts.find((p) => p.type === type).value;
    return val("year") + val("month") + val("day");
  }
  function timestampKey(timestamp) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
    const val = (type) => parts.find((p) => p.type === type).value;
    return val("year") + val("month") + val("day");
  }
  function boundaryKey() {
    const key = todayKey();
    const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
    d.setUTCFullYear(d.getUTCFullYear() - 2);
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  }
  function transaction(storeNames, mode, operation) {
    return db().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction(storeNames, mode);
      let result;
      try { result = operation(tx); } catch (e) { tx.abort(); reject(e); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Follow-up cache transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Follow-up cache transaction aborted."));
    }));
  }
  function requestResult(request) {
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }
  async function getRecords(city) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(RECORDS, "readonly");
      const req = tx.objectStore(RECORDS).index("accountCity").getAll(IDBKeyRange.only([account(), city]));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function getState(city) {
    const d = await db();
    const tx = d.transaction(STATES, "readonly");
    return requestResult(tx.objectStore(STATES).get([account(), city]));
  }
  async function commitSnapshot(city, records, state) {
    const acct = account();
    return transaction([RECORDS, STATES], "readwrite", (tx) => {
      const recordStore = tx.objectStore(RECORDS);
      const range = IDBKeyRange.bound([acct, city, 0], [acct, city, Number.MAX_SAFE_INTEGER]);
      recordStore.delete(range);
      records.forEach((r) => recordStore.put(Object.assign({}, r, { account: acct, city })));
      tx.objectStore(STATES).put(Object.assign({}, state, { account: acct, city }));
    });
  }
  async function commitIncremental(city, records, state) {
    const acct = account();
    return transaction([RECORDS, STATES], "readwrite", (tx) => {
      const store = tx.objectStore(RECORDS);
      records.forEach((r) => store.put(Object.assign({}, r, { account: acct, city })));
      tx.objectStore(STATES).put(Object.assign({}, state, { account: acct, city }));
    });
  }
  async function setState(city, state) {
    return transaction(STATES, "readwrite", (tx) => tx.objectStore(STATES).put(Object.assign({}, state, { account: account(), city })));
  }
  function payload(action, city, extra) {
    const u = typeof activeUser !== "undefined" ? activeUser : null;
    if (!u) throw new Error("Log in to synchronize Follow-up records.");
    return Object.assign({ action, city, username: u.username, password: u.password, installationId: typeof getInstallationId === "function" ? getInstallationId() : "", sessionId: u.sessionId || "", sourceFcmToken: "" }, extra || {});
  }
  async function post(data) {
    const response = await fetchWithTimeout(BACKEND_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(data), cache: "no-store", redirect: "follow" }, 65000);
    if (!response.ok) throw new Error("Follow-up synchronization failed (HTTP " + response.status + ").");
    const body = await response.json();
    if (!body || body.ok !== true) throw new Error(String(body && body.error || "Follow-up synchronization failed."));
    if (String(body.city || body.visitingCity || data.city).trim() !== data.city) throw new Error("Follow-up synchronization returned a different city.");
    return body;
  }
  function normalizeRecord(raw, city) {
    if (!raw || typeof raw !== "object") return null;
    const date = String(raw.date || raw.visitingDate || raw.appointmentDate || "").trim().replace(/[-/]/g, "").slice(0, 8);
    const row = Number(raw.sourceRow ?? raw.rowNumber ?? raw.row ?? 0);
    const age = Number(raw.age);
    const name = String(raw.name || raw.patientName || raw.patient || "").trim();
    const recordCity = String(raw.city || raw.visitingCity || city).trim();
    if (recordCity !== city || !Number.isInteger(row) || row < 2 || !/^\d{8}$/.test(date) || !name || !Number.isFinite(age) || age < 0) return null;
    return { sourceRow: row, date, time: String(raw.time || raw.appointmentTime || "").trim(), name, age, ageUnit: String(raw.ageUnit || raw.unit || "years").trim().toLowerCase(), address: String(raw.address || "").trim(), patientType: String(raw.patientType || raw.type || "Follow-up").trim(), whatsapp: String(raw.whatsapp || raw.whatsappNumber || raw.mobileNumber || raw.mobile || "").replace(/\D/g, "").slice(-10), city, referredBy: String(raw.referredBy || raw.reference || "").trim(), nextFollowupCity: String(raw.nextFollowupCity || raw.nextFollowUpCity || "").trim() };
  }
  function validDateRange(date, boundary, today) { return /^\d{8}$/.test(date) && date >= boundary && date < today; }
  async function sync(city, options) {
    const force = !!(options && options.force);
    const previous = await getState(city);
    const now = Date.now();
    if (!force && previous && previous.status === "READY" && previous.lastSyncAt && timestampKey(previous.lastSyncAt) === todayKey()) {
      return { state: previous, unchanged: true };
    }
    await setState(city, Object.assign({}, previous || {}, { status: "SYNCING", lastUpdatedAt: now, lastError: "" }));
    try {
      let state = previous;
      if (!previous || !Number(previous.recordCount) || (options && options.forceRebuild) || !Number(previous.highestContiguousSourceRow)) {
        const response = await post(payload("getFollowupCache", city, { requireCache: false }));
        const recordsRaw = Array.isArray(response.records) ? response.records : Array.isArray(response.patients) ? response.patients : [];
        const records = recordsRaw.map((r) => normalizeRecord(r, city)).filter(Boolean);
        const today = todayKey();
        const boundary = String(response.boundaryDate || boundaryKey());
        const cacheVersion = String(response.cacheVersion || "");
        const source = String(response.source || "CACHE");
        const cacheStatus = String(response.cacheStatus || "");
        if (cacheVersion !== CACHE_VERSION || !/^\d{8}$/.test(boundary)) throw new Error("Follow-up cache version or boundary validation failed.");
        if (response.date && String(response.date) !== today) throw new Error("Follow-up cache response is from a different date.");
        if (source === "CACHE" && !["CACHE_HIT", "CACHE_REBUILT"].includes(cacheStatus)) throw new Error("Follow-up cache status validation failed.");
        if (records.length !== Number(response.recordCount ?? records.length)) throw new Error("Follow-up cache record count validation failed.");
        const rows = new Set();
        records.forEach((r) => { if (!validDateRange(r.date, boundary, today) || rows.has(r.sourceRow)) throw new Error("Follow-up cache contains an invalid or duplicate row."); rows.add(r.sourceRow); });
        const ordered = [...rows].sort((a, b) => a - b);
        let contiguous = 1;
        for (const row of ordered) { if (row !== contiguous + 1) break; contiguous = row; }
        const lastSyncAt = Date.now();
        state = { status: "READY", boundaryDate: boundary, highestKnownSourceRow: ordered.length ? ordered[ordered.length - 1] : 1, highestContiguousSourceRow: contiguous, lowestSourceRow: ordered[0] || 1, recordCount: records.length, cacheGeneration: String(response.cacheGeneration || ""), cacheVersion, lastSyncAt, lastServerCheckAt: lastSyncAt, lastUpdatedAt: lastSyncAt, lastError: "", cacheStatus, source };
        await commitSnapshot(city, records, state);
        return { state, full: true };
      }
      const fromRow = Math.max(2, Number(previous.highestContiguousSourceRow || 1) + 1);
      const refreshFromRow = Math.max(2, Number(previous.highestKnownSourceRow || 1) - 500);
      const response = await post(payload("getFollowupCityIncremental", city, { fromRow, refreshFromRow }));
      const recordsRaw = Array.isArray(response.records) ? response.records : Array.isArray(response.patients) ? response.patients : [];
      const records = recordsRaw.map((r) => normalizeRecord(r, city)).filter(Boolean);
      const toRow = Number(response.toRow ?? previous.highestContiguousSourceRow);
      const known = Math.max(Number(previous.highestContiguousSourceRow || 1), Number(response.highestKnownSourceRow || 1), toRow);
      if (Number(response.fromRow ?? fromRow) !== fromRow || Number(response.refreshFromRow ?? refreshFromRow) !== refreshFromRow || toRow < Number(previous.highestContiguousSourceRow || 1) || toRow > known) throw new Error("Incremental Follow-up synchronization returned invalid row boundaries.");
      const today = todayKey();
      const boundary = String(response.boundaryDate || previous.boundaryDate || boundaryKey());
      if (String(response.todayKey || today) !== today || !/^\d{8}$/.test(boundary)) throw new Error("Incremental Follow-up synchronization returned a stale date or invalid boundary.");
      const seen = new Set();
      records.forEach((r) => { if (!validDateRange(r.date, boundary, today) || seen.has(r.sourceRow)) throw new Error("Incremental Follow-up records failed validation."); seen.add(r.sourceRow); });
      const lastSyncAt = Date.now();
      const currentRecords = await getRecords(city);
      const merged = new Map(currentRecords.map((r) => [r.sourceRow, r]));
      records.forEach((r) => merged.set(r.sourceRow, r));
      state = Object.assign({}, previous, { status: "READY", boundaryDate: boundary, highestKnownSourceRow: known, highestContiguousSourceRow: Math.max(Number(previous.highestContiguousSourceRow || 1), toRow), lowestSourceRow: Math.min(...Array.from(merged.keys()), 1), recordCount: merged.size, lastSyncAt, lastServerCheckAt: lastSyncAt, lastUpdatedAt: lastSyncAt, lastError: "" });
      await commitIncremental(city, records, state);
      return { state, incremental: true };
    } catch (error) {
      const failedAt = Date.now();
      const failed = Object.assign({}, previous || {}, { status: "FAILED", lastUpdatedAt: failedAt, lastError: error && error.message ? error.message : "Follow-up synchronization failed." });
      await setState(city, failed);
      throw error;
    }
  }
  window.NeuronFollowupCache = { getRecords, getState, sync, todayKey, cacheVersion: CACHE_VERSION };
})();
