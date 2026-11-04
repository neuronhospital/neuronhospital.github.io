/* NEURON website mutation lifecycle: stable request identity and evidence-based resolution. */
(function (root) {
  "use strict";

  const STATES = Object.freeze({
    PENDING: "PENDING",
    IN_FLIGHT: "IN_FLIGHT",
    UNKNOWN: "UNKNOWN",
    CONFIRMED: "CONFIRMED",
    FAILED: "FAILED"
  });
  const SUPPORTED_EVENTS = new Set([
    "OPD_BOOKING", "OPD_UPDATE", "EEG_BOOKING", "EEG_UPDATE",
    "EEG_CALLS_BOOKING", "EEG_CALLS_UPDATE",
    "AMB_EEG_CALLS_BOOKING", "AMB_EEG_CALLS_UPDATE", "PREBOOKING_CREATE", "REFUND"
  ]);
  const BOOKING_EVENTS = new Set(["OPD_BOOKING", "EEG_CALLS_BOOKING", "AMB_EEG_CALLS_BOOKING", "PREBOOKING_CREATE"]);
  const STALE_ATTEMPT_MS = 60 * 1000;

  function required(value, name) {
    const text = String(value == null ? "" : value).trim();
    if (!text) throw new TypeError(name + " is required.");
    return text;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    const keys = Object.keys(value).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }

  function fingerprint(payload) {
    // Deterministic local identity guard; not a cryptographic signature.
    return stableStringify(payload);
  }

  function newMutationId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (root.crypto && typeof root.crypto.getRandomValues === "function") root.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  function identityMatches(mutation, evidence) {
    const evidenceRequestId = String(evidence.requestId || evidence.bookingRequestId || "").trim();
    const evidenceMutationId = String(evidence.mutationId || "").trim();
    const evidenceEventType = String(evidence.eventType || "").trim();
    return evidenceRequestId === mutation.requestId &&
      evidenceMutationId === mutation.mutationId &&
      (!evidenceEventType || evidenceEventType === mutation.eventType);
  }

  function hasSuccessSignal(evidence, source) {
    // FCM confirmation is validated against the exact mutation/request/event identity.
    if (source === "FCM") return true;
    if (!evidence || typeof evidence !== "object") return false;
    const outcome = String(evidence.status || evidence.outcome || "").toUpperCase();
    // An explicit inconclusive state must never be overridden by a generic `ok:true`.
    if (["UNKNOWN", "INCONCLUSIVE", "FAILED", "IN_PROGRESS", "PENDING", "NOT_COMMITTED"].includes(outcome)) return false;
    return evidence.ok === true || evidence.success === true ||
      ["SUCCESS", "CONFIRMED", "OK", "COMMITTED"].includes(outcome);
  }

  function validateSuccessEvidence(mutation, evidence, source) {
    if (!evidence || typeof evidence !== "object" || !identityMatches(mutation, evidence) || !hasSuccessSignal(evidence, source)) return null;
    if (source === "FCM" && String(evidence.eventType || "").trim() !== mutation.eventType) return null;
    const appointmentId = String(evidence.appointmentId || "").trim();
    if (BOOKING_EVENTS.has(mutation.eventType) && !appointmentId) return null;
    if (mutation.appointmentId && appointmentId && mutation.appointmentId !== appointmentId) return null;
    return {
      appointmentId: appointmentId || mutation.appointmentId || "",
      confirmationSource: source,
      confirmedAt: Number(evidence.confirmedAt || evidence.receivedAt) > 0
        ? Number(evidence.confirmedAt || evidence.receivedAt) : Date.now(),
      evidence: {
        eventType: mutation.eventType,
        requestId: mutation.requestId,
        mutationId: mutation.mutationId,
        appointmentId: appointmentId || "",
        source
      }
    };
  }

  async function create(input) {
    if (!root.NeuronStorage) throw new Error("Local data storage is unavailable.");
    if (!input || typeof input !== "object") throw new TypeError("Mutation input is required.");
    const requestId = required(input.requestId, "requestId");
    const mutationId = required(input.mutationId || newMutationId(), "mutationId");
    const eventType = required(input.eventType, "eventType");
    if (!SUPPORTED_EVENTS.has(eventType)) throw new TypeError("Unsupported mutation event type: " + eventType);
    if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new TypeError("Mutation payload must be an object.");
    const explicitOperationId = input.operationId != null && String(input.operationId).trim() !== "";
    const data = {
      // Android keeps a distinct operationId, request identity, and mutationId.
      // Generate it once at creation; on an idempotent duplicate, retain the
      // already-persisted operationId rather than treating a fresh candidate as conflict.
      operationId: required(input.operationId || newMutationId(), "operationId"),
      requestId, mutationId, eventType,
      scope: required(input.scope, "scope"),
      city: required(input.city, "city"),
      date: required(input.date, "date"),
      recordId: input.recordId == null ? null : String(input.recordId),
      payload: input.payload,
      payloadFingerprint: fingerprint(input.payload),
      status: STATES.PENDING,
      createdAt: Date.now()
    };
    const result = await root.NeuronStorage.createMutationIfAbsent(data);
    const existing = result.existing;
    if (!existing || existing.requestId !== requestId || existing.mutationId !== mutationId ||
        (explicitOperationId && existing.operationId !== data.operationId) || existing.eventType !== eventType ||
        existing.payloadFingerprint !== data.payloadFingerprint) {
      throw new Error("This request ID is already bound to a different mutation or payload. Do not reuse it.");
    }
    return { created: result.created, mutation: existing };
  }

  async function get(requestId) {
    const mutation = await root.NeuronStorage.getMutation(required(requestId, "requestId"));
    if (mutation && !mutation.operationId) {
      // Backward compatibility for durable mutation records created before the
      // operationId field was added. requestId remains the stable local key.
      mutation.operationId = mutation.requestId;
    }
    return mutation;
  }

  async function claimAttempt(requestId) {
    const result = await root.NeuronStorage.updateMutation(requestId, [STATES.PENDING, STATES.UNKNOWN], (current) => ({
      ...current,
      operationId: current.operationId || current.requestId,
      status: STATES.IN_FLIGHT,
      attempts: Number(current.attempts || 0) + 1,
      lastAttemptAt: Date.now(),
      errorMessage: ""
    }));
    return result.updated ? result.mutation : null;
  }

  async function recoverStaleInFlight(requestId, now) {
    const cutoffNow = Number(now) || Date.now();
    const result = await root.NeuronStorage.updateMutation(requestId, [STATES.IN_FLIGHT], (current) => {
      if (cutoffNow - Number(current.lastAttemptAt || current.updatedAt || 0) < STALE_ATTEMPT_MS) return current;
      return { ...current, status: STATES.UNKNOWN, errorMessage: "The previous attempt ended without a reliable result." };
    });
    return result.mutation || null;
  }

  // Sweep durable mutation records after a reload or return to the page. Only
  // stale IN_FLIGHT entries are moved to UNKNOWN; recent attempts are left
  // alone, and no operation is automatically replayed from this recovery path.
  async function recoverInterruptedOperations(now) {
    if (!root.NeuronStorage || typeof root.NeuronStorage.listPendingMutations !== "function") {
      return { scanned: 0, recovered: 0, records: [] };
    }
    const at = Number(now) || Date.now();
    const records = await root.NeuronStorage.listPendingMutations();
    let recovered = 0;
    const changed = [];
    for (const record of records || []) {
      if (!record || record.status !== STATES.IN_FLIGHT) continue;
      const startedAt = Number(record.lastAttemptAt || record.updatedAt || record.createdAt || 0);
      if (!startedAt || at - startedAt < STALE_ATTEMPT_MS) continue;
      const result = await recoverStaleInFlight(record.requestId, at);
      if (result && result.status === STATES.UNKNOWN && result.errorMessage === "The previous attempt ended without a reliable result.") {
        recovered += 1;
        changed.push(result);
      }
    }
    if (changed.length && typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") {
      root.dispatchEvent(new root.CustomEvent("neuron:mutation-recovery", { detail: { recovered: changed.length, records: changed } }));
    }
    return { scanned: (records || []).length, recovered, records: changed };
  }

  async function markUnknown(requestId, message) {
    const result = await root.NeuronStorage.updateMutation(requestId, [STATES.IN_FLIGHT, STATES.PENDING], (current) => ({
      ...current, status: STATES.UNKNOWN,
      errorMessage: String(message || "The result could not be verified.").slice(0, 500)
    }));
    return result.mutation || null;
  }

  async function markDefinitiveFailure(requestId, evidence) {
    const current = await get(requestId);
    if (!current || !evidence || evidence.definitive !== true ||
        String(evidence.status || evidence.outcome || "").toUpperCase() !== "FAILED" ||
        !identityMatches(current, evidence)) return null;
    const result = await root.NeuronStorage.updateMutation(requestId, [STATES.IN_FLIGHT, STATES.PENDING, STATES.UNKNOWN], (record) => ({
      ...record, status: STATES.FAILED,
      errorMessage: String(evidence.message || evidence.error || "The backend definitively rejected this mutation.").slice(0, 500),
      failureAt: Date.now()
    }));
    return result.mutation || null;
  }

  async function persistConfirmedEegCallCache(mutation) {
    if (!mutation || mutation.eventType !== "EEG_CALLS_BOOKING" || !mutation.appointmentId || !root.NeuronStorage) return;
    const scope = mutation.scope === "eegCallsAmbajogai" ? "eegCallsAmbajogai" :
      (mutation.scope === "eegCallsLatur" ? "eegCallsLatur" : "");
    if (!scope) return;
    const payload = mutation.payload || {};
    const data = {
      appointmentId: String(mutation.appointmentId),
      bookingRequestId: String(mutation.requestId),
      mutationId: String(mutation.mutationId || ""),
      patientName: String(payload.patientName || ""),
      age: payload.age == null ? "" : String(payload.age),
      ageUnit: String(payload.ageUnit || "years"),
      address: String(payload.address || ""),
      whatsapp: String(payload.whatsapp || ""),
      referredBy: String(payload.referredBy || ""),
      paymentReceived: Number(payload.paymentReceived || 0),
      eegTechnician: String(payload.eegTechnician || ""),
      city: String(mutation.city || ""),
      date: String(mutation.date || ""),
      confirmedAt: Number(mutation.confirmedAt || Date.now())
    };
    try {
      await root.NeuronStorage.putRecord({
        scope, city: mutation.city, date: mutation.date,
        recordId: String(mutation.appointmentId), data, status: "current", updatedAt: data.confirmedAt
      });
    } catch (error) {
      // Confirmation is authoritative. A local cache write failure must never
      // roll back or misreport the already-persisted mutation confirmation.
      if (root.console && typeof root.console.warn === "function") root.console.warn("Confirmed EEG Calls cache write failed:", error);
    }
  }

  async function confirm(requestId, evidence, source) {
    const current = await get(requestId);
    if (!current) return { confirmed: false, reason: "not_found" };
    const validated = validateSuccessEvidence(current, evidence, required(source, "confirmation source"));
    if (!validated) return { confirmed: false, reason: "invalid_or_mismatched_evidence" };
    // Valid confirmation evidence may recover a local FAILED/UNKNOWN result, but
    // never overwrites an already-confirmed mutation with conflicting evidence.
    const result = await root.NeuronStorage.updateMutation(requestId,
      [STATES.PENDING, STATES.IN_FLIGHT, STATES.UNKNOWN, STATES.FAILED], (record) => {
        if (record.status === STATES.CONFIRMED) return record;
        return {
          ...record,
          status: STATES.CONFIRMED,
          appointmentId: validated.appointmentId,
          confirmedAt: validated.confirmedAt,
          confirmationSource: validated.confirmationSource,
          confirmationEvidence: validated.evidence,
          errorMessage: ""
        };
      });
    const saved = result.mutation || current;
    const confirmed = saved.status === STATES.CONFIRMED && saved.appointmentId === validated.appointmentId;
    if (confirmed) await persistConfirmedEegCallCache(saved);
    return { confirmed, recovered: confirmed && current.status === STATES.FAILED, mutation: saved };
  }

  async function classifyTransportResult(requestId, response, body) {
    const current = await get(requestId);
    if (!current) return { state: "NOT_FOUND" };
    if (body && body.definitive === true && String(body.status || body.outcome || "").toUpperCase() === "FAILED") {
      const failureEvidence = { ...body, requestId: body.requestId || current.requestId, mutationId: body.mutationId || current.mutationId, eventType: body.eventType || current.eventType };
      const failed = await markDefinitiveFailure(requestId, failureEvidence);
      return { state: failed ? STATES.FAILED : STATES.UNKNOWN, mutation: failed };
    }
    if (response && response.ok && body && typeof body === "object") {
      // Correlation is supplied by this request's response channel; use the
      // persisted identity when the legacy endpoint does not echo identifiers.
      const isUpdateLike = ["OPD_UPDATE", "EEG_UPDATE", "EEG_CALLS_UPDATE", "AMB_EEG_CALLS_UPDATE", "REFUND"].includes(current.eventType);
      const correlatedEvidence = {
        ...body,
        // Update operations target an existing bookingRequestId, while the local
        // mutation record uses its own unique request key. The direct HTTP response
        // is correlated to this request; do not mistake the target ID for that key.
        requestId: body.requestId || (isUpdateLike ? current.requestId : body.bookingRequestId || current.requestId),
        mutationId: body.mutationId || current.mutationId,
        eventType: body.eventType || current.eventType,
        // Preserve the backend's actual success signal. Do not manufacture `ok:true`
        // from a 2xx HTTP status: Apps Script may return an inconclusive JSON result.
        ok: body.ok === true,
        success: body.success === true
      };
      const confirmed = await confirm(requestId, correlatedEvidence, "HTTP");
      if (confirmed.confirmed) return { state: STATES.CONFIRMED, mutation: confirmed.mutation };
      // A 2xx response without valid mutation-specific success evidence is not
      // a confirmed success, and is not a definitive failure either.
      const unknown = await markUnknown(requestId, "The server response did not contain verifiable confirmation evidence.");
      return { state: unknown ? STATES.UNKNOWN : current.status, mutation: unknown };
    }
    const unknown = await markUnknown(requestId, "The request outcome is uncertain. Do not create a new request; retry with the same request identity after checking its status.");
    return { state: unknown ? STATES.UNKNOWN : current.status, mutation: unknown };
  }

  async function retryEnvelope(requestId) {
    const current = await get(requestId);
    if (!current) throw new Error("Mutation request was not found.");
    if (![STATES.PENDING, STATES.UNKNOWN].includes(current.status)) {
      throw new Error("Only pending or unknown mutations can be retried with the existing request identity.");
    }
    const claimed = await claimAttempt(requestId);
    if (!claimed) throw new Error("Another attempt is already in progress, or this mutation is already resolved.");
    // Exact stored payload and operation/request/mutation identities are preserved.
    // Callers must not generate replacement IDs when retrying this envelope.
    return {
      operationId: claimed.operationId || claimed.requestId,
      requestId: claimed.requestId,
      mutationId: claimed.mutationId,
      eventType: claimed.eventType,
      scope: claimed.scope,
      city: claimed.city,
      date: claimed.date,
      recordId: claimed.recordId,
      payload: claimed.payload,
      attempt: claimed.attempts
    };
  }

  async function list(status) {
    return root.NeuronStorage.listPendingMutations(status);
  }

  function presentation(status) {
    const value = String(status || "").toUpperCase();
    const labels = {
      PENDING: { label: "Pending", className: "pending", tone: "warning", icon: "◷", message: "This request is waiting to be submitted or resolved." },
      IN_FLIGHT: { label: "Submitting", className: "in-flight", tone: "warning", icon: "↻", message: "The request is being sent. Avoid submitting it again." },
      UNKNOWN: { label: "Result not verified", className: "unknown", tone: "warning", icon: "?", message: "The server result is uncertain. Keep the same request identity for recovery." },
      CONFIRMED: { label: "Confirmed", className: "confirmed", tone: "success", icon: "✓", message: "Valid confirmation evidence was received." },
      FAILED: { label: "Failed", className: "failed", tone: "danger", icon: "!", message: "The backend provided a definitive failure result." }
    };
    return labels[value] || { label: "Status unavailable", className: "unknown", tone: "warning", icon: "?", message: "The request status is not recognized." };
  }

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    return "₹" + (Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  }

  function paymentDetails(mutation) {
    const payload = mutation && mutation.payload || {};
    const prefix = String(mutation && mutation.eventType || "").startsWith("EEG") ? "eeg" : "opd";
    const charge = payload[prefix + "Charges"];
    const mode = String(payload[prefix + "PaymentMode"] || "").trim() || "Cash";
    const cash = Number(payload[prefix + "CashPaid"] || 0);
    const online = Number(payload[prefix + "OnlinePaid"] || 0);
    const rows = [];
    if (charge != null && charge !== "") rows.push({ label: "Charges", value: money(charge) });
    rows.push({ label: "Payment mode", value: mode });
    if (mode === "Split" || (cash > 0 && online > 0)) {
      rows.push({ label: "Cash", value: money(cash) }, { label: "Online", value: money(online) }, { label: "Total paid", value: money(cash + online) });
    } else if (mode === "Online") rows.push({ label: "Online paid", value: money(online || charge) });
    else rows.push({ label: "Cash paid", value: money(cash || charge) });
    return rows;
  }

  function renderStatus(container, mutation, options) {
    if (!container || !mutation) return;
    const opts = options || {};
    const state = presentation(mutation.status);
    const wrap = document.createElement("div");
    wrap.className = "mutation-status-view mutation-tone-" + state.tone;
    const banner = document.createElement("div"); banner.className = "mutation-status-banner";
    const icon = document.createElement("span"); icon.className = "mutation-status-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = state.icon;
    const label = document.createElement("strong"); label.textContent = state.label;
    banner.append(icon, label);
    const message = document.createElement("p"); message.className = "mutation-status-message"; message.textContent = mutation.errorMessage || state.message;
    wrap.append(banner, message);
    if (opts.showIdentity !== false) {
      const identity = document.createElement("small"); identity.className = "mutation-request-identity";
      identity.textContent = "Request ID: " + String(mutation.requestId || "—"); wrap.append(identity);
    }
    if (opts.payment !== false && mutation.payload && /BOOKING|UPDATE/.test(String(mutation.eventType || ""))) {
      const rows = paymentDetails(mutation);
      if (rows.length) {
        const table = document.createElement("dl"); table.className = "mutation-payment-details";
        rows.forEach((row) => { const dt = document.createElement("dt"); dt.textContent = row.label; const dd = document.createElement("dd"); dd.textContent = row.value; table.append(dt, dd); });
        wrap.append(table);
      }
    }
    container.append(wrap);
    return wrap;
  }

  function confirmOperation(options) {
    const opts = options || {};
    const dialog = document.getElementById("mutationConfirmDialog");
    if (!dialog || typeof dialog.showModal !== "function") {
      return Promise.resolve(root.confirm(String(opts.message || "Continue with this operation?") + (opts.detail ? "\n\n" + opts.detail : "")));
    }
    const title = dialog.querySelector("[data-mutation-dialog-title]");
    const message = dialog.querySelector("[data-mutation-dialog-message]");
    const details = dialog.querySelector("[data-mutation-dialog-details]");
    const cancel = dialog.querySelector("[data-mutation-dialog-cancel]");
    const accept = dialog.querySelector("[data-mutation-dialog-accept]");
    title.textContent = String(opts.title || "Confirm operation");
    message.textContent = String(opts.message || "Review the details before continuing.");
    details.textContent = String(opts.detail || ""); details.hidden = !opts.detail;
    accept.textContent = String(opts.acceptLabel || "Continue"); cancel.textContent = String(opts.cancelLabel || "Cancel");
    return new Promise((resolve) => {
      const finish = (value) => { cancel.removeEventListener("click", onCancel); accept.removeEventListener("click", onAccept); dialog.removeEventListener("cancel", onNativeCancel); if (dialog.open) dialog.close(); resolve(value); };
      const onCancel = () => finish(false); const onAccept = () => finish(true); const onNativeCancel = () => finish(false);
      cancel.addEventListener("click", onCancel); accept.addEventListener("click", onAccept); dialog.addEventListener("cancel", onNativeCancel);
      dialog.showModal();
    });
  }

  root.NeuronMutations = Object.freeze({
    STATES, SUPPORTED_EVENTS: Array.from(SUPPORTED_EVENTS), newMutationId,
    create, get, claimAttempt, recoverStaleInFlight, recoverInterruptedOperations, markUnknown,
    markDefinitiveFailure, confirm, classifyTransportResult, retryEnvelope, list,
    presentation, renderStatus, paymentDetails, confirmOperation, money, validateSuccessEvidence, fingerprint
  });
})(typeof window !== "undefined" ? window : globalThis);
