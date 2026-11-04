/* NEURON website browser data layer. Patient/cache records stay in IndexedDB, not localStorage. */
(function (root) {
  "use strict";

  const DB_NAME = "neuronWebsiteData";
  const DB_VERSION = 1;
  const STORES = Object.freeze({
    records: "records",
    sync: "syncState",
    mutations: "pendingMutations",
    config: "cacheConfig"
  });
  const VALID_SCOPES = new Set([
    "opdToday", "followup", "prebooking", "eegCalls", "ambajogaiEegCalls", "configuration"
  ]);
  let dbPromise = null;

  function storageError(message, cause) {
    const error = new Error(message);
    if (cause) error.cause = cause;
    return error;
  }

  function requireText(value, field) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(field + " is required.");
    return text;
  }

  function validateScope(scope) {
    const value = requireText(scope, "scope");
    if (!VALID_SCOPES.has(value)) throw new TypeError("Unsupported cache scope: " + value);
    return value;
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || storageError("IndexedDB request failed."));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || storageError("IndexedDB transaction aborted."));
      transaction.onerror = () => reject(transaction.error || storageError("IndexedDB transaction failed."));
    });
  }

  function openDatabase() {
    if (!root.indexedDB) return Promise.reject(storageError("This browser does not support IndexedDB."));
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction;
        // Version 1 schema. Future schema changes must use a higher DB_VERSION and
        // an explicit upgrade branch; do not clear existing user data on upgrade.
        if (event.oldVersion < 1) {
          const records = db.createObjectStore(STORES.records, { keyPath: ["scope", "city", "date", "recordId"] });
          records.createIndex("byScopeCityDate", ["scope", "city", "date"], { unique: false });
          records.createIndex("byScope", "scope", { unique: false });
          db.createObjectStore(STORES.sync, { keyPath: ["scope", "city", "date"] });
          const mutations = db.createObjectStore(STORES.mutations, { keyPath: "requestId" });
          mutations.createIndex("byStatus", "status", { unique: false });
          mutations.createIndex("byCreatedAt", "createdAt", { unique: false });
          db.createObjectStore(STORES.config, { keyPath: "key" });
        }
        if (tx) {
          const meta = tx.objectStore(STORES.config);
          meta.put({ key: "schemaVersion", value: DB_VERSION, updatedAt: Date.now() });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || storageError("Unable to open the website data store."));
      };
      request.onblocked = () => {
        // A stale tab may be holding an older connection. Keep the promise pending
        // until the browser resolves the blocked upgrade/open request.
      };
    });
    return dbPromise;
  }

  async function runTransaction(storeNames, mode, operation) {
    const db = await openDatabase();
    const tx = db.transaction(storeNames, mode);
    let operationResult;
    try {
      operationResult = operation(tx);
    } catch (error) {
      try { tx.abort(); } catch (_) {}
      throw error;
    }
    await transactionDone(tx);
    return operationResult;
  }

  function normalizeRecord(input) {
    if (!input || typeof input !== "object") throw new TypeError("Record must be an object.");
    const scope = validateScope(input.scope);
    const city = requireText(input.city, "city");
    const date = requireText(input.date, "date");
    const recordId = requireText(input.recordId, "recordId");
    if (!Object.prototype.hasOwnProperty.call(input, "data")) throw new TypeError("record data is required.");
    return {
      scope, city, date, recordId,
      data: input.data,
      status: input.status === "stale" ? "stale" : "current",
      updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : Date.now()
    };
  }

  function getRecordRange(scope, city, date) {
    return IDBKeyRange.only([validateScope(scope), requireText(city, "city"), requireText(date, "date")]);
  }

  async function getRecords(args) {
    const db = await openDatabase();
    const tx = db.transaction(STORES.records, "readonly");
    const request = tx.objectStore(STORES.records).index("byScopeCityDate").getAll(
      getRecordRange(args.scope, args.city, args.date)
    );
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result;
  }

  async function getRecord(args) {
    const db = await openDatabase();
    const tx = db.transaction(STORES.records, "readonly");
    const request = tx.objectStore(STORES.records).get([
      validateScope(args.scope), requireText(args.city, "city"),
      requireText(args.date, "date"), requireText(args.recordId, "recordId")
    ]);
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result || null;
  }

  async function putRecord(input) {
    const record = normalizeRecord(input);
    await runTransaction([STORES.records], "readwrite", (tx) => {
      tx.objectStore(STORES.records).put(record);
    });
    return record;
  }

  async function putRecords(inputs) {
    if (!Array.isArray(inputs)) throw new TypeError("Records must be an array.");
    const records = inputs.map(normalizeRecord);
    await runTransaction([STORES.records], "readwrite", (tx) => {
      const store = tx.objectStore(STORES.records);
      records.forEach((record) => store.put(record));
    });
    return records.length;
  }

  // Replace one city/date cache slice atomically. Other cities/dates/scopes are untouched.
  async function replaceSlice(args) {
    const scope = validateScope(args.scope);
    const city = requireText(args.city, "city");
    const date = requireText(args.date, "date");
    if (!Array.isArray(args.records)) throw new TypeError("records must be an array.");
    const records = args.records.map((item) => normalizeRecord({ ...item, scope, city, date }));
    const sync = {
      scope, city, date,
      status: "complete",
      lastSuccessAt: Number.isFinite(Number(args.completedAt)) ? Number(args.completedAt) : Date.now(),
      recordCount: records.length,
      syncVersion: Number.isFinite(Number(args.syncVersion)) ? Number(args.syncVersion) : null,
      error: null
    };
    const db = await openDatabase();
    const tx = db.transaction([STORES.records, STORES.sync], "readwrite");
    const recordStore = tx.objectStore(STORES.records);
    const range = getRecordRange(scope, city, date);
    const cursorRequest = recordStore.index("byScopeCityDate").openCursor(range);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        records.forEach((record) => recordStore.put(record));
        tx.objectStore(STORES.sync).put(sync);
      }
    };
    await transactionDone(tx);
    return sync;
  }

  async function getSyncState(args) {
    const db = await openDatabase();
    const tx = db.transaction(STORES.sync, "readonly");
    const request = tx.objectStore(STORES.sync).get([
      validateScope(args.scope), requireText(args.city, "city"), requireText(args.date, "date")
    ]);
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result || null;
  }

  async function markSliceStale(args) {
    const scope = validateScope(args.scope);
    const city = requireText(args.city, "city");
    const date = requireText(args.date, "date");
    const db = await openDatabase();
    const tx = db.transaction(STORES.sync, "readwrite");
    const store = tx.objectStore(STORES.sync);
    const key = [scope, city, date];
    const request = store.get(key);
    request.onsuccess = () => {
      const prior = request.result || { scope, city, date, recordCount: 0, lastSuccessAt: null };
      store.put({ ...prior, status: "stale", staleAt: Date.now(), error: args.reason ? String(args.reason) : null });
    };
    await transactionDone(tx);
  }

  async function savePendingMutation(input) {
    if (!input || typeof input !== "object") throw new TypeError("Mutation must be an object.");
    const requestId = requireText(input.requestId, "requestId");
    const scope = validateScope(input.scope);
    const city = requireText(input.city, "city");
    const date = requireText(input.date, "date");
    const mutation = {
      requestId, scope, city, date,
      recordId: input.recordId == null ? null : String(input.recordId),
      payload: input.payload,
      status: input.status || "pending",
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now(),
      updatedAt: Date.now(),
      attempts: Number.isFinite(Number(input.attempts)) ? Number(input.attempts) : 0
    };
    await runTransaction([STORES.mutations], "readwrite", (tx) => tx.objectStore(STORES.mutations).put(mutation));
    return mutation;
  }

  async function listPendingMutations(status) {
    const db = await openDatabase();
    const tx = db.transaction(STORES.mutations, "readonly");
    const store = tx.objectStore(STORES.mutations);
    const request = status ? store.index("byStatus").getAll(requireText(status, "status")) : store.getAll();
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result;
  }

  async function deletePendingMutation(requestId) {
    await runTransaction([STORES.mutations], "readwrite", (tx) => {
      tx.objectStore(STORES.mutations).delete(requireText(requestId, "requestId"));
    });
  }

  async function setConfig(key, value) {
    const itemKey = requireText(key, "key");
    await runTransaction([STORES.config], "readwrite", (tx) => {
      tx.objectStore(STORES.config).put({ key: itemKey, value, updatedAt: Date.now() });
    });
  }

  async function getConfig(key) {
    const db = await openDatabase();
    const tx = db.transaction(STORES.config, "readonly");
    const request = tx.objectStore(STORES.config).get(requireText(key, "key"));
    const item = await requestToPromise(request);
    await transactionDone(tx);
    return item ? item.value : null;
  }

  async function clearScopeSlice(args) {
    const scope = validateScope(args.scope);
    const city = requireText(args.city, "city");
    const date = requireText(args.date, "date");
    const db = await openDatabase();
    const tx = db.transaction([STORES.records, STORES.sync], "readwrite");
    const cursorRequest = tx.objectStore(STORES.records).index("byScopeCityDate").openCursor(getRecordRange(scope, city, date));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.objectStore(STORES.sync).delete([scope, city, date]);
    await transactionDone(tx);
  }

  function isQuotaError(error) {
    return !!error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
  }

  const api = Object.freeze({
    open: openDatabase,
    getRecords, getRecord, putRecord, putRecords, replaceSlice,
    getSyncState, markSliceStale,
    savePendingMutation, listPendingMutations, deletePendingMutation,
    setConfig, getConfig, clearScopeSlice,
    isQuotaError,
    constants: Object.freeze({ DB_NAME, DB_VERSION, STORES, VALID_SCOPES: Array.from(VALID_SCOPES) })
  });
  root.NeuronStorage = api;
})(typeof window !== "undefined" ? window : globalThis);
