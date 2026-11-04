/* NEURON shared web infrastructure: API transport, identity/date normalization, and UI helpers. */
(function (root) {
  "use strict";

  const BACKEND_URL = root.BACKEND_URL || "https://script.google.com/macros/s/AKfycbydDHTK0diS9Vius8V9y5kgjnmwoNPIBc9gjcdtN1GcDJIWY0Ql_JlCXxX8vNh5C34/exec";
  const CITY_NAMES = Object.freeze(["Latur", "Udgir", "Nilanga", "Dharashiv", "Omerga", "Barshi", "Beed", "Ambajogai"]);
  const CITY_ALIASES = Object.freeze({ osmanabad: "Dharashiv" });

  function normalizeCity(value) {
    const raw = String(value == null ? "" : value).trim().toLocaleLowerCase("en-IN");
    const canonical = CITY_ALIASES[raw] || raw;
    return CITY_NAMES.find((city) => city.toLocaleLowerCase("en-IN") === canonical) || "";
  }
  function normalizeDigits(value) { return String(value == null ? "" : value).replace(/\D/g, ""); }
  function normalizePatientName(value) { return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN"); }
  function indiaDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + values.month + values.day;
  }
  function errorMessage(error, fallback = "The request could not be completed.") {
    if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
    return fallback;
  }
  async function request(payload, timeoutMs = 35000) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("API payload must be an object.");
    const canAbort = typeof root.AbortController === "function";
    const controller = canAbort ? new root.AbortController() : null;
    const timer = canAbort ? root.setTimeout(() => controller.abort(), Number(timeoutMs) || 35000) : null;
    try {
      let response;
      try {
        response = await root.fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
          body: JSON.stringify(payload), cache: "no-store", redirect: "follow",
          ...(controller ? { signal: controller.signal } : {})
        });
      } catch (error) {
        if (error && error.name === "AbortError") throw new Error("The request timed out. Its result may be unknown; check the saved request before submitting again.");
        throw new Error("Unable to reach the NEURON server. Check your connection and try again.");
      }
      let body = null;
      try { body = await response.json(); } catch (_) {}
      return { response, body };
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }
  async function confirmAction(message, options = {}) {
    if (typeof root.confirm !== "function") return false;
    return root.confirm(String(message || "Are you sure?") + (options.detail ? "\n\n" + options.detail : ""));
  }
  function showValidationError(target, message) {
    if (!target) return false;
    target.textContent = String(message || "");
    target.hidden = !message;
    return !message;
  }

  root.NeuronCore = Object.freeze({
    request, normalizeCity, normalizeDigits, normalizePatientName, indiaDateKey,
    errorMessage, confirmAction, showValidationError
  });
})(window);
