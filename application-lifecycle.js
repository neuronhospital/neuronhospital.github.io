/* NEURON browser application lifecycle: version metadata, logout cleanup, and refresh recovery. */
(function (root) {
  "use strict";

  // Bump only when a persisted browser-data format becomes incompatible. This
  // metadata version is separate from the IndexedDB schema version.
  const DATA_VERSION = 1;
  const VERSION_KEY = "neuronWebsiteDataVersion";
  const DERIVED_CONFIG_CACHE_KEYS = ["neuronWebsiteAppConfiguration_v1"];

  function initialize() {
    let priorVersion = null;
    try {
      const raw = root.localStorage.getItem(VERSION_KEY);
      priorVersion = raw == null ? null : Number(raw);
      if (priorVersion !== DATA_VERSION) {
        // Only invalidate the derived public configuration snapshot when its
        // format epoch changes. Preserve login, user preferences, and the
        // IndexedDB mutation journal so an upgrade cannot discard a booking.
        DERIVED_CONFIG_CACHE_KEYS.forEach((key) => root.localStorage.removeItem(key));
        root.localStorage.setItem(VERSION_KEY, String(DATA_VERSION));
      }
    } catch (_) {
      // Storage may be disabled/private. In-memory operation remains possible.
    }
    return { dataVersion: DATA_VERSION, migrated: priorVersion !== DATA_VERSION };
  }

  function clearLogoutState() {
    // Clear transient form/UI values without deleting durable patient cache data,
    // notification preferences, approximate-city preference, or mutation records.
    try {
      root.document.querySelectorAll("form").forEach((form) => {
        if (form.id !== "loginForm") form.reset();
      });
      root.document.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ""; });
      root.document.querySelectorAll("[data-neuron-user-transient]").forEach((node) => {
        if ("value" in node) node.value = "";
        else node.textContent = "";
      });
    } catch (_) {}
  }

  function restoreAfterBrowserRefresh(sessionExists) {
    // URL hash is intentionally retained; app routing validates the target against
    // the restored session and role before rendering it.
    if (!sessionExists) {
      try {
        const url = new URL(root.location.href);
        if (url.hash && url.hash !== "#/home") {
          url.hash = "/home";
          root.history.replaceState(root.history.state || {}, "", url);
        }
      } catch (_) {}
    }
  }

  root.NeuronApplicationLifecycle = Object.freeze({
    initialize, clearLogoutState, restoreAfterBrowserRefresh, DATA_VERSION
  });
})(typeof window !== "undefined" ? window : globalThis);
