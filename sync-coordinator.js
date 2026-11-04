/* Cross-feature browser synchronization coordinator with lifecycle recovery. */
(function (root) {
  "use strict";
  const PREFIX = "neuronSyncCoordinator_v1_";
  const LEASE_MS = 75000;
  const HEARTBEAT_MS = 20000;
  const STALE_SYNC_MS = LEASE_MS + 5000;
  const active = new Map();
  const tasks = new Map();
  const localStates = new Map();
  const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const sleep = (ms) => new Promise((resolve) => root.setTimeout(resolve, ms));
  let channel = null;
  let started = false;
  let lastVisibleAt = Date.now();

  function safeRead(key) { try { return JSON.parse(root.localStorage.getItem(key) || "null"); } catch (_) { return null; } }
  function safeWrite(key, value) { try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function publish(name, state) {
    localStates.set(name, state);
    safeWrite(PREFIX + name, state);
    try { if (channel) channel.postMessage({ task: name, state }); } catch (_) {}
    try { root.dispatchEvent(new CustomEvent("neuron:sync-state", { detail: { task: name, state } })); } catch (_) {}
  }
  function getState(name) {
    // Prefer the newest cross-tab persisted state over an older in-memory copy.
    const stored = safeRead(PREFIX + name), local = localStates.get(name);
    if (stored && (!local || Number(stored.completedAt || stored.startedAt || 0) >= Number(local.completedAt || local.startedAt || 0))) {
      localStates.set(name, stored); return stored;
    }
    return local || stored;
  }
  function leaseKey(name) { return PREFIX + "lease_" + name; }
  async function acquire(name, token, waitMs) {
    const deadline = Date.now() + Math.max(0, waitMs || 0);
    while (true) {
      const key = leaseKey(name), now = Date.now(), prior = safeRead(key);
      if (!prior || Number(prior.expiresAt) <= now || prior.token === token) {
        const lease = { token, expiresAt: now + LEASE_MS, acquiredAt: now };
        if (!safeWrite(key, lease)) return { acquired: true, noStorage: true };
        const verified = safeRead(key);
        if (verified && verified.token === token) return { acquired: true, key };
      }
      if (Date.now() >= deadline) return { acquired: false, busy: true, ownerExpiresAt: Number(prior && prior.expiresAt) || 0 };
      await sleep(Math.min(350, Math.max(50, deadline - Date.now())));
    }
  }
  function release(lease, token) {
    if (!lease || !lease.key) return;
    const current = safeRead(lease.key);
    if (current && current.token === token) { try { root.localStorage.removeItem(lease.key); } catch (_) {} }
  }
  function recoverStaleStates() {
    const now = Date.now();
    for (const name of tasks.keys()) {
      const state = getState(name);
      if (state && state.status === "SYNCING" && now - Number(state.startedAt || 0) > STALE_SYNC_MS) {
        publish(name, {
          ...state, status: "INTERRUPTED", completedAt: now,
          lastSuccessAt: state.lastSuccessAt || null,
          error: "Synchronization was interrupted while this tab was suspended or closed. It can be retried safely."
        });
      }
    }
  }
  async function run(name, work, options) {
    name = String(name || "").trim();
    if (!name || typeof work !== "function") throw new TypeError("A sync task name and function are required.");
    if (active.has(name)) return active.get(name);
    const opts = options || {}, token = randomId(), startedAt = Date.now();
    const executeWithLease = async () => {
      const lease = await acquire(name, token, Number(opts.waitForLeaseMs || 0));
      if (!lease.acquired) {
        const skipped = { status: "SKIPPED_BUSY", task: name, startedAt, completedAt: Date.now(), ownerExpiresAt: lease.ownerExpiresAt || null };
        publish(name, skipped); return skipped;
      }
      let heartbeat = null;
      if (lease.key) heartbeat = root.setInterval(() => {
        const current = safeRead(lease.key);
        if (current && current.token === token) safeWrite(lease.key, { ...current, expiresAt: Date.now() + LEASE_MS });
      }, HEARTBEAT_MS);
      const prior = getState(name);
      publish(name, { status: "SYNCING", task: name, startedAt, lastSuccessAt: prior && prior.lastSuccessAt || null, attempt: Number(opts.attempt || 1) });
      try {
        if (root.navigator && root.navigator.onLine === false) {
          const offlineError = new Error("The browser is offline."); offlineError.name = "NetworkError"; throw offlineError;
        }
        const result = await work();
        const state = { status: "SUCCESS", task: name, startedAt, completedAt: Date.now(), lastSuccessAt: Date.now(), attempt: Number(opts.attempt || 1), resultSummary: opts.summary ? String(opts.summary(result)) : undefined };
        publish(name, state); return { status: "SUCCESS", result, state };
      } catch (error) {
        const offline = (root.navigator && root.navigator.onLine === false) || (error && (error.name === "NetworkError" || error.name === "TypeError"));
        const state = {
          status: offline ? "NETWORK_INTERRUPTED" : "FAILED", task: name,
          startedAt, completedAt: Date.now(), lastSuccessAt: prior && prior.lastSuccessAt || null,
          attempt: Number(opts.attempt || 1), error: String(error && error.message || error || "Synchronization failed.")
        };
        publish(name, state); throw error;
      } finally {
        if (heartbeat !== null) root.clearInterval(heartbeat);
        release(lease, token);
      }
    };
    const promise = (async () => {
      // Web Locks provides an atomic same-origin exclusive lock where supported;
      // the expiring localStorage lease remains the fallback for older browsers.
      const locks = root.navigator && root.navigator.locks;
      if (locks && typeof locks.request === "function") {
        let callbackEntered = false;
        try {
          return await locks.request("neuron-sync-" + name, { mode: "exclusive", ifAvailable: true }, async (lock) => {
            callbackEntered = true;
            if (!lock) {
              const busy = { status: "SKIPPED_BUSY", task: name, startedAt, completedAt: Date.now() };
              publish(name, busy); return busy;
            }
            return executeWithLease();
          });
        } catch (error) {
          if (callbackEntered) throw error; // Never replay work after its callback began.
          /* fall back to the storage lease if Web Locks is unavailable at runtime */
        }
      }
      return executeWithLease();
    })();
    active.set(name, promise);
    try { return await promise; } finally { if (active.get(name) === promise) active.delete(name); }
  }
  function register(name, callback, options) {
    if (!name || typeof callback !== "function") throw new TypeError("A sync task name and callback are required.");
    tasks.set(String(name), { callback, options: options || {} });
    return () => tasks.delete(String(name));
  }
  async function runRegistered(options) {
    if (!root.navigator || root.navigator.onLine === false || (root.document && root.document.visibilityState === "hidden")) return [];
    recoverStaleStates();
    const results = [];
    for (const [name, task] of tasks.entries()) {
      const state = getState(name), interval = Math.max(0, Number(task.options.intervalMs || 0));
      if (!(options && options.force) && state && state.lastSuccessAt && Date.now() - state.lastSuccessAt < interval) continue;
      try { results.push(await run(name, task.callback, { ...task.options, waitForLeaseMs: Number(task.options.waitForLeaseMs || 0) })); }
      catch (error) { results.push({ status: getState(name)?.status || "FAILED", task: name, error: String(error && error.message || error) }); }
    }
    return results;
  }
  function runIfReady() {
    if (!root.document || root.document.visibilityState !== "visible" || (root.navigator && root.navigator.onLine === false)) return;
    recoverStaleStates();
    runRegistered();
  }
  function start() {
    if (started) return;
    started = true;
    try { if (typeof root.BroadcastChannel === "function") {
      channel = new root.BroadcastChannel("neuron-sync-coordinator-v1");
      channel.addEventListener("message", (event) => {
        const item = event && event.data;
        if (!item || !item.task || !item.state) return;
        const current = localStates.get(item.task);
        if (!current || Number(item.state.completedAt || item.state.startedAt || 0) >= Number(current.completedAt || current.startedAt || 0)) localStates.set(item.task, item.state);
      });
    } } catch (_) { channel = null; }
    root.addEventListener("online", runIfReady);
    root.addEventListener("focus", runIfReady);
    root.addEventListener("pageshow", (event) => { if (event && event.persisted) { lastVisibleAt = Date.now(); recoverStaleStates(); } runIfReady(); });
    root.addEventListener("pagehide", () => {
      // Do not release an in-flight lease here: a fetch may already have reached
      // the server. Let its bounded lease expire to prevent a duplicate request.
    });
    root.addEventListener("storage", (event) => {
      if (!event || !event.key || !event.key.startsWith(PREFIX) || event.key.includes("lease_")) return;
      const name = event.key.slice(PREFIX.length);
      if (!name || !event.newValue) return;
      try { const state = JSON.parse(event.newValue); localStates.set(name, state); } catch (_) {}
    });
    if (root.document) root.document.addEventListener("visibilitychange", () => {
      if (root.document.visibilityState === "visible") { lastVisibleAt = Date.now(); runIfReady(); }
    });
    root.setInterval(runIfReady, 15 * 60 * 1000);
    runIfReady();
  }
  root.NeuronSyncCoordinator = Object.freeze({
    run, register, runRegistered, getState,
    getAllStates: () => Array.from(tasks.keys()).map((name) => ({ task: name, state: getState(name) })),
    recoverStaleStates, start
  });
})(window);
