/* Shared, DOM-safe UI helpers. Existing feature pages can adopt these incrementally. */
(function (global) {
  "use strict";
  let toastHost;
  let liveRegion;
  const timers = new WeakMap();

  function ensureHosts() {
    if (!document.body) return;
    if (!liveRegion) {
      liveRegion = document.createElement("div");
      liveRegion.className = "neuron-live-region";
      liveRegion.setAttribute("aria-live", "polite");
      liveRegion.setAttribute("aria-atomic", "true");
      liveRegion.id = "neuron-live-region";
      document.body.appendChild(liveRegion);
    }
    if (!toastHost) {
      toastHost = document.createElement("div");
      toastHost.className = "neuron-toast-host";
      toastHost.setAttribute("aria-label", "Notifications");
      document.body.appendChild(toastHost);
    }
  }

  function toast(message, kind = "info", duration = 4000) {
    ensureHosts();
    if (!toastHost || !liveRegion) return null;
    const item = document.createElement("div");
    item.className = "neuron-toast";
    item.dataset.kind = ["success", "error", "warning", "info"].includes(kind) ? kind : "info";
    item.setAttribute("role", kind === "error" ? "alert" : "status");
    item.textContent = String(message ?? "");
    toastHost.appendChild(item);
    liveRegion.textContent = "";
    liveRegion.textContent = item.textContent;
    const timeout = Math.max(1200, Number(duration) || 4000);
    const timer = global.setTimeout(() => item.remove(), timeout);
    timers.set(item, timer);
    return item;
  }

  function message(target, text, kind = "info") {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    if (!element) return null;
    let node = element.querySelector(":scope > .neuron-message");
    if (!node) {
      node = document.createElement("div");
      node.className = "neuron-message";
      element.prepend(node);
    }
    node.dataset.kind = ["success", "error", "warning", "info"].includes(kind) ? kind : "info";
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
    node.textContent = String(text ?? "");
    return node;
  }

  function clearMessage(target) {
    const element = typeof target === "string" ? document.getElementById(target) : target;
    element?.querySelectorAll(":scope > .neuron-message").forEach(node => node.remove());
  }

  function setBusy(control, busy, label) {
    if (!control) return;
    const isBusy = Boolean(busy);
    if (isBusy) {
      if (!Object.prototype.hasOwnProperty.call(control.dataset, "neuronOriginalLabel")) {
        control.dataset.neuronOriginalLabel = control.textContent;
        control.dataset.neuronOriginalDisabled = control.disabled ? "1" : "0";
      }
      control.disabled = true;
      control.classList.add("neuron-busy");
      control.setAttribute("aria-busy", "true");
      if (label !== undefined) control.textContent = String(label);
      return;
    }
    control.disabled = control.dataset.neuronOriginalDisabled === "1";
    if (control.dataset.neuronOriginalLabel !== undefined) control.textContent = control.dataset.neuronOriginalLabel;
    delete control.dataset.neuronOriginalLabel;
    delete control.dataset.neuronOriginalDisabled;
    control.classList.remove("neuron-busy");
    control.removeAttribute("aria-busy");
  }

  function validateForm(form) {
    if (!form || typeof form.checkValidity !== "function") return false;
    if (form.checkValidity()) return true;
    form.reportValidity?.();
    form.querySelector(":invalid")?.focus?.();
    return false;
  }

  function formatDate(value, options = {}) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      timeZone: global.NEURON_CONFIG?.timezone || "Asia/Kolkata", ...options
    }).format(date);
  }

  function formatTime(value, options = {}) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true,
      timeZone: global.NEURON_CONFIG?.timezone || "Asia/Kolkata", ...options
    }).format(date);
  }

  global.NeuronUI = Object.freeze({ toast, message, clearMessage, setBusy, validateForm, formatDate, formatTime });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureHosts, { once: true });
  else ensureHosts();
})(window);
