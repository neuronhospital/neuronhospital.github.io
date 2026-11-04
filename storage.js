/* NEURON website browser data layer. Patient/cache records stay in IndexedDB, not localStorage. */
(function (root) {
  "use strict";

  const DB_NAME = "neuronWebsiteData";
  const DB_VERSION = 2;
  const STORES = Object.freeze({
    records: "records",
    sync: "syncState",
    mutations: "pendingMutations",
    config: "cacheConfig"
  });
  const VALID_SCOPES = new Set([
    "opdToday", "eegToday", "followup", "prebooking", "eegCalls", "ambajogaiEegCalls", "eegCallsLatur", "eegCallsAmbajogai", "configuration"
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

    const pending = new Promise((resolve, reject) => {
      let request;
      try {
        request = root.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(storageError("Unable to open the website data store.", error));
        return;
      }
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
        // Version 2 adds a city-scoped index for cache browsing without changing
        // the compound primary key or deleting existing cached data.
        if (event.oldVersion < 2) {
          const records = tx.objectStore(STORES.records);
          if (!records.indexNames.contains("byScopeCity")) records.createIndex("byScopeCity", ["scope", "city"], { unique: false });
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
        // A connection can close outside a version upgrade (for example, when
        // the browser evicts or closes the database). Do not retain a resolved
        // promise for a connection that can no longer serve transactions.
        db.onclose = () => {
          if (dbPromise) dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        reject(request.error || storageError("Unable to open the website data store."));
      };
      request.onblocked = () => {
        // A stale tab may be holding an older connection. Keep the promise pending
        // until the browser resolves the blocked upgrade/open request.
      };
    });

    // Reset the cached promise after every failed open, including synchronous
    // SecurityError/InvalidStateError throws and asynchronous request failures.
    dbPromise = pending.catch((error) => {
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  function createTransaction(db, storeNames, mode) {
    try {
      return db.transaction(storeNames, mode);
    } catch (error) {
      // A browser may close/evict an IndexedDB connection between operations.
      // Clear the cached connection promise so a later call can reopen it.
      if (error && (error.name === "InvalidStateError" || error.name === "NotFoundError")) {
        dbPromise = null;
      }
      throw storageError("Unable to start a local data transaction.", error);
    }
  }

  async function runTransaction(storeNames, mode, operation) {
    const db = await openDatabase();
    const tx = createTransaction(db, storeNames, mode);
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
    const tx = createTransaction(db, STORES.records, "readonly");
    const request = tx.objectStore(STORES.records).index("byScopeCityDate").getAll(
      getRecordRange(args.scope, args.city, args.date)
    );
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result;
  }

  async function getRecord(args) {
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.records, "readonly");
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

  // Replace one or more city/date cache slices atomically. This allows a verified
  // OPD response and its derived EEG-eligible cache to commit together.
  async function replaceSlices(slices) {
    if (!Array.isArray(slices) || !slices.length) throw new TypeError("At least one cache slice is required.");
    const sliceKeys = new Set();
    const normalized = slices.map((args) => {
      const scope = validateScope(args.scope);
      const city = requireText(args.city, "city");
      const date = requireText(args.date, "date");
      const sliceKey = JSON.stringify([scope, city, date]);
      if (sliceKeys.has(sliceKey)) throw new TypeError("A cache slice may only be replaced once per transaction.");
      sliceKeys.add(sliceKey);
      if (!Array.isArray(args.records)) throw new TypeError("records must be an array.");
      const records = args.records.map((item) => normalizeRecord({ ...item, scope, city, date }));
      const sync = {
        scope, city, date,
        status: "complete",
        lastSuccessAt: Number.isFinite(Number(args.completedAt)) ? Number(args.completedAt) : Date.now(),
        recordCount: records.length,
        syncVersion: Number.isFinite(Number(args.syncVersion)) ? Number(args.syncVersion) : null,
        lastSerial: Number.isFinite(Number(args.lastSerial)) ? Number(args.lastSerial) : null,
        lastRowNumber: Number.isFinite(Number(args.lastRowNumber)) ? Number(args.lastRowNumber) : null,
        error: null
      };
      return { scope, city, date, records, sync };
    });
    const db = await openDatabase();
    const tx = createTransaction(db, [STORES.records, STORES.sync], "readwrite");
    const recordStore = tx.objectStore(STORES.records);
    normalized.forEach(({ scope, city, date, records, sync }) => {
      const cursorRequest = recordStore.index("byScopeCityDate").openCursor(getRecordRange(scope, city, date));
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
    });
    await transactionDone(tx);
    return normalized.map((item) => item.sync);
  }

  async function replaceSlice(args) {
    const result = await replaceSlices([args]);
    return result[0];
  }

  async function getRecordsByScope(args) {
    const scope = validateScope(args.scope);
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.records, "readonly");
    const store = tx.objectStore(STORES.records);
    let request;
    if (args.city != null && String(args.city).trim()) {
      request = store.index("byScopeCity").getAll(IDBKeyRange.only([scope, requireText(args.city, "city")]));
    } else {
      request = store.index("byScope").getAll(IDBKeyRange.only(scope));
    }
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result || [];
  }

  async function deleteRecord(args) {
    const key = [validateScope(args.scope), requireText(args.city, "city"), requireText(args.date, "date"), requireText(args.recordId, "recordId")];
    await runTransaction([STORES.records], "readwrite", (tx) => tx.objectStore(STORES.records).delete(key));
  }

  async function getSyncState(args) {
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.sync, "readonly");
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
    const tx = createTransaction(db, STORES.sync, "readwrite");
    const store = tx.objectStore(STORES.sync);
    const key = [scope, city, date];
    const request = store.get(key);
    request.onsuccess = () => {
      const prior = request.result;
      // A failed first sync must not manufacture a stale-cache record when no
      // successful snapshot exists for this slice.
      if (!prior) return;
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
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.mutations, "readwrite");
    const request = tx.objectStore(STORES.mutations).add(mutation);
    let constraintError = null;
    request.onerror = (event) => {
      if (request.error && request.error.name === "ConstraintError") {
        constraintError = request.error;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    await transactionDone(tx);
    if (constraintError) {
      const existing = await getMutation(requestId);
      if (existing && existing.scope === mutation.scope && existing.city === mutation.city &&
          existing.date === mutation.date && JSON.stringify(existing.payload) === JSON.stringify(mutation.payload)) return existing;
      throw storageError("This request ID is already associated with a different mutation payload.", constraintError);
    }
    return mutation;
  }

  async function getMutation(requestId) {
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.mutations, "readonly");
    const request = tx.objectStore(STORES.mutations).get(requireText(requestId, "requestId"));
    const result = await requestToPromise(request);
    await transactionDone(tx);
    return result || null;
  }

  // Add is intentionally used instead of put for first creation: an existing
  // request identity must never be silently replaced by a second submit.
  async function createMutationIfAbsent(input) {
    if (!input || typeof input !== "object") throw new TypeError("Mutation must be an object.");
    const mutation = {
      requestId: requireText(input.requestId, "requestId"),
      operationId: requireText(input.operationId || input.requestId, "operationId"),
      scope: validateScope(input.scope),
      city: requireText(input.city, "city"),
      date: requireText(input.date, "date"),
      recordId: input.recordId == null ? null : String(input.recordId),
      mutationId: requireText(input.mutationId, "mutationId"),
      eventType: requireText(input.eventType, "eventType"),
      payload: input.payload,
      payloadFingerprint: requireText(input.payloadFingerprint, "payloadFingerprint"),
      status: input.status || "PENDING",
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      confirmedAt: 0,
      confirmationSource: "",
      appointmentId: "",
      errorMessage: ""
    };
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.mutations, "readwrite");
    const request = tx.objectStore(STORES.mutations).add(mutation);
    let constraintError = null;
    request.onerror = (event) => {
      if (request.error && request.error.name === "ConstraintError") {
        constraintError = request.error;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    await transactionDone(tx);
    if (constraintError) return { created: false, existing: await getMutation(mutation.requestId) };
    return { created: true, existing: mutation };
  }

  // Update is serialized by IndexedDB and status-gated in the same transaction.
  // The mutator is synchronous so no transaction is kept alive across awaits.
  async function updateMutation(requestId, allowedStatuses, mutator) {
    const key = requireText(requestId, "requestId");
    if (!Array.isArray(allowedStatuses) || typeof mutator !== "function") throw new TypeError("Mutation update requires allowed statuses and a mutator.");
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.mutations, "readwrite");
    const store = tx.objectStore(STORES.mutations);
    let outcome = { updated: false, mutation: null };
    const request = store.get(key);
    request.onsuccess = () => {
      const current = request.result;
      if (!current || !allowedStatuses.includes(current.status)) {
        outcome = { updated: false, mutation: current || null };
        return;
      }
      const next = mutator({ ...current });
      if (!next || next.requestId !== current.requestId || next.mutationId !== current.mutationId ||
          (current.operationId && next.operationId !== current.operationId)) {
        tx.abort();
        return;
      }
      next.updatedAt = Date.now();
      store.put(next);
      outcome = { updated: true, mutation: next };
    };
    await transactionDone(tx);
    return outcome;
  }

  async function listPendingMutations(status) {
    const db = await openDatabase();
    const tx = createTransaction(db, STORES.mutations, "readonly");
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
    const tx = createTransaction(db, STORES.config, "readonly");
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
    const tx = createTransaction(db, [STORES.records, STORES.sync], "readwrite");
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
    getRecords, getRecord, putRecord, putRecords, replaceSlice, replaceSlices, getRecordsByScope, deleteRecord,
    getSyncState, markSliceStale,
    savePendingMutation, createMutationIfAbsent, getMutation, updateMutation,
    listPendingMutations, deletePendingMutation,
    setConfig, getConfig, clearScopeSlice,
    isQuotaError,
    constants: Object.freeze({ DB_NAME, DB_VERSION, STORES, VALID_SCOPES: Array.from(VALID_SCOPES) })
  });
  root.NeuronStorage = api;
})(typeof window !== "undefined" ? window : globalThis);
