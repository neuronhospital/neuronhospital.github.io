/* Phase 6.8: common helpers for EEG feature modules. */
(function (root) {
  "use strict";
  function indiaDateKey() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + values.month + values.day;
  }
  function requestId(prefix) {
    const random = root.crypto && typeof root.crypto.randomUUID === "function" ? root.crypto.randomUUID().replace(/-/g, "") : (Date.now().toString(16) + Math.random().toString(16).slice(2));
    return String(prefix || "WEB_EEG_") + random;
  }
  function makeBookingRequestId() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const result = [];
    // 234 is divisible by 26; reject higher bytes to avoid modulo bias.
    // Keep the exact eight-uppercase-letter contract required by the backend.
    while (result.length < 8) {
      const bytes = new Uint8Array(Math.max(8, (8 - result.length) * 2));
      if (root.crypto && typeof root.crypto.getRandomValues === "function") root.crypto.getRandomValues(bytes);
      else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      for (const byte of bytes) {
        if (byte >= 234) continue;
        result.push(alphabet[byte % 26]);
        if (result.length === 8) break;
      }
    }
    return result.join("");
  }
  async function post(payload, timeoutMs) {
    // AbortController is not guaranteed in every supported browser/webview.
    // Keep the request functional there instead of failing before fetch begins.
    const canAbort = typeof root.AbortController === "function";
    const controller = canAbort ? new root.AbortController() : null;
    const timer = canAbort ? root.setTimeout(() => controller.abort(), Number(timeoutMs) || 35000) : null;
    try {
      const options = { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" }, body: JSON.stringify(payload), cache: "no-store", redirect: "follow" };
      if (controller) options.signal = controller.signal;
      const response = await root.fetch(BACKEND_URL, options);
      let body = null;
      try { body = await response.json(); }
      catch (_) {
        // Non-JSON backend errors are handled by the caller using HTTP status.
      }
      return { response, body };
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }
  root.NeuronEegCommon = Object.freeze({ indiaDateKey, requestId, makeBookingRequestId, post });
})(window);
