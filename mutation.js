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
    "AMB_EEG_CALLS_BOOKING", "AMB_EEG_CALLS_UPDATE", "REFUND"
  ]);
  const BOOKING_EVENTS = new Set(["OPD_BOOKING", "EEG_CALLS_BOOKING", "AMB_EEG_CALLS_BOOKING"]);
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
    // A validated FCM event is identified by its exact mutation/request/event
    // identity; the Android event contract does not require a status field.
    if (source === "FCM") return true;
    return evidence && (evidence.ok === true || evidence.success === true ||
      ["SUCCESS", "CONFIRMED", "OK"].includes(String(evidence.status || evidence.outcome || "").toUpperCase()));
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
    const data = {
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
    if (!existing || existing.mutationId !== mutationId || existing.eventType !== eventType ||
        existing.payloadFingerprint !== data.payloadFingerprint) {
      throw new Error("This request ID is already bound to a different mutation or payload. Do not reuse it.");
    }
    return { created: result.created, mutation: existing };
  }

  async function get(requestId) {
    return root.NeuronStorage.getMutation(required(requestId, "requestId"));
  }

  async function claimAttempt(requestId) {
    const result = await root.NeuronStorage.updateMutation(requestId, [STATES.PENDING, STATES.UNKNOWN], (current) => ({
      ...current,
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
        ok: body.ok === false ? false : true
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
    // Exact stored payload and both identities are preserved. Callers must not
    // generate a new requestId/mutationId when retrying this envelope.
    return { requestId: claimed.requestId, mutationId: claimed.mutationId, eventType: claimed.eventType, payload: claimed.payload, attempt: claimed.attempts };
  }

  async function list(status) {
    return root.NeuronStorage.listPendingMutations(status);
  }

  function presentation(status) {
    const value = String(status || "").toUpperCase();
    const labels = {
      PENDING: { label: "Pending", className: "pending", message: "This request is waiting to be submitted or resolved." },
      IN_FLIGHT: { label: "Submitting", className: "in-flight", message: "The request is being sent. Avoid submitting it again." },
      UNKNOWN: { label: "Result not verified", className: "unknown", message: "The server result is uncertain. Keep the same request identity for recovery." },
      CONFIRMED: { label: "Confirmed", className: "confirmed", message: "Valid confirmation evidence was received." },
      FAILED: { label: "Failed", className: "failed", message: "The backend provided a definitive failure result." }
    };
    return labels[value] || { label: "Status unavailable", className: "unknown", message: "The request status is not recognized." };
  }

  root.NeuronMutations = Object.freeze({
    STATES, SUPPORTED_EVENTS: Array.from(SUPPORTED_EVENTS), newMutationId,
    create, get, claimAttempt, recoverStaleInFlight, markUnknown,
    markDefinitiveFailure, confirm, classifyTransportResult, retryEnvelope, list,
    presentation, validateSuccessEvidence, fingerprint
  });
})(typeof window !== "undefined" ? window : globalThis);
