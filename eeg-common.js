/* Phase 5.3: reusable EEG-specific identity, session, city and payment infrastructure. */
(function (root) {
  "use strict";
  const CITIES = Object.freeze(["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"]);

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
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; const result = [];
    while (result.length < 8) {
      const bytes = new Uint8Array(Math.max(8, (8 - result.length) * 2));
      if (root.crypto && typeof root.crypto.getRandomValues === "function") root.crypto.getRandomValues(bytes);
      else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
      for (const byte of bytes) { if (byte >= 234) continue; result.push(alphabet[byte % 26]); if (result.length === 8) break; }
    }
    return result.join("");
  }
  function session(key = "neuronWebsiteSession_v2") {
    try { return JSON.parse(root.localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function normalizeCity(value) {
    const raw = String(value == null ? "" : value).trim().toLocaleLowerCase("en-IN");
    const canonical = raw === "osmanabad" ? "dharashiv" : raw;
    return CITIES.find((city) => city.toLocaleLowerCase("en-IN") === canonical) || "";
  }
  function allowedCities(user) {
    if (!user) return [];
    const city = normalizeCity(user.city);
    if (user.admin || city === "Latur") return CITIES.slice();
    return city ? [city] : [];
  }
  function patientIdentity(patient) {
    const p = patient || {};
    return {
      bookingRequestId: String(p.bookingRequestId || p.opdBookingRequestId || p.requestId || "").trim(),
      appointmentId: String(p.appointmentId || p.appointmentID || "").trim(),
      rowNumber: Number(p.rowNumber || 0)
    };
  }
  function validatePayment(chargesValue, cashValue, onlineValue) {
    const chargesText = String(chargesValue == null ? "" : chargesValue).trim();
    const cashText = String(cashValue == null ? "" : cashValue).trim();
    const onlineText = String(onlineValue == null ? "" : onlineValue).trim();
    const charges = chargesText === "" ? NaN : Number(chargesText);
    const cash = cashText === "" ? 0 : Number(cashText);
    const online = onlineText === "" ? 0 : Number(onlineText);
    if (!Number.isFinite(charges) || charges < 0 || !Number.isFinite(cash) || cash < 0 || !Number.isFinite(online) || online < 0)
      return { valid: false, error: "Enter valid non-negative EEG charge and payment amounts.", charges, cash, online, total: cash + online };
    if (cash + online > charges + 0.001)
      return { valid: false, error: "Payment cannot exceed EEG charges.", charges, cash, online, total: cash + online };
    return { valid: true, error: "", charges, cash, online, total: cash + online };
  }
  function normalizePatient(patient) {
    const p = patient || {}; const identity = patientIdentity(p);
    return { ...p, ...identity, city: normalizeCity(p.city) || String(p.city || "").trim(), name: String(p.name || p.patientName || "").trim(), whatsapp: String(p.whatsapp || p.phone || "").trim() };
  }
  async function post(payload, timeoutMs) {
    if (!root.NeuronCore || typeof root.NeuronCore.request !== "function") throw new Error("Shared API infrastructure is unavailable.");
    return root.NeuronCore.request(payload, timeoutMs);
  }
  root.NeuronEegCommon = Object.freeze({ CITIES, indiaDateKey, requestId, makeBookingRequestId, session, normalizeCity, allowedCities, patientIdentity, validatePayment, normalizePatient, post });
})(window);
