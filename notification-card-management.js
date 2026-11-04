/* Administrator notification-card publishing and lifecycle management. */
(() => {
  "use strict";
  const MAX_CHARS = 3900;
  const MAX_CARDS = 100;
  const MAX_PROPERTY_BYTES = 8000;
  const $ = (id) => document.getElementById(id);
  let cards = [];
  let selectedId = null;
  let busy = false;
  let verified = false;
  let initialized = false;
  let sessionKey = "";
  let requestCounter = 0;

  function setStatus(message, state = "") {
    const el = $("notificationCardManagementStatus");
    if (el) { el.textContent = message; el.dataset.state = state; }
  }
  function id() { requestCounter += 1; return `NC_${makeRequestId()}_${requestCounter}`; }
  function safeHtml(raw) {
    const doc = new DOMParser().parseFromString(String(raw || "").slice(0, 12000), "text/html");
    const allowed = new Set(["A", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL", "INS", "P", "BR", "HR", "UL", "OL", "LI", "BLOCKQUOTE", "DIV", "SPAN", "FONT", "H1", "H2", "H3", "H4", "H5", "H6", "SMALL", "BIG", "SUB", "SUP", "CODE", "PRE", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "CENTER"]);
    const dangerous = new Set(["SCRIPT", "STYLE", "IFRAME", "FRAME", "FRAMESET", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "OPTION", "VIDEO", "AUDIO", "SOURCE", "IMG", "PICTURE", "CANVAS", "LINK", "META", "BASE", "APPLET", "TEMPLATE"]);
    const validColor = (v) => /^(#[0-9a-f]{3}(?:[0-9a-f]{3})?|[a-z]{3,20}|rgba?\([0-9 ,.%]+\))$/i.test(String(v).trim());
    const styleAllowed = (rawStyle) => {
      const result = [];
      String(rawStyle || "").split(";").forEach((declaration) => {
        const parts = declaration.split(":", 2); if (parts.length !== 2) return;
        const prop = parts[0].trim().toLowerCase(), value = parts[1].trim().toLowerCase();
        if (!value || /url\(|expression|javascript|@import|var\(/i.test(value)) return;
        let valid = false;
        if (["color", "background-color"].includes(prop)) valid = validColor(value);
        else if (prop === "text-align") valid = ["left", "right", "center", "justify"].includes(value);
        else if (prop === "font-weight") valid = ["normal", "bold", "bolder", "lighter"].includes(value) || Number(value) >= 100 && Number(value) <= 900 && Number.isInteger(Number(value));
        else if (prop === "font-style") valid = ["normal", "italic", "oblique"].includes(value);
        else if (prop === "text-decoration") valid = ["none", "underline", "line-through", "overline"].includes(value);
        else if (prop === "font-size") valid = /^(?:(?:[6-9]|[1-4][0-9])(?:px|pt|%)|(?:0\.[7-9]|[1-3](?:\.[0-9])?)em)$/.test(value);
        else if (["margin", "margin-top", "margin-bottom", "padding", "padding-top", "padding-bottom"].includes(prop)) valid = /^(?:0|[0-9]{1,2}(?:px|pt|em|%))(?:\s+(?:0|[0-9]{1,2}(?:px|pt|em|%))){0,3}$/.test(value);
        else if (prop === "border-collapse") valid = ["collapse", "separate"].includes(value);
        else if (prop === "border") valid = /^(?:0|[0-9]{1,2}px)(?:\s+(?:solid|dashed|dotted|double))?(?:\s+(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|[a-z]{3,20}))?$/i.test(value);
        else if (prop === "width") valid = /^(?:[1-9][0-9]?%|100%|[1-9][0-9]{0,2}px)$/.test(value);
        if (valid) result.push(`${prop}:${value}`);
      });
      return result.join(";");
    };
    Array.from(doc.body.querySelectorAll("*")).forEach((node) => {
      if (dangerous.has(node.tagName)) { node.remove(); return; }
      if (!allowed.has(node.tagName)) { node.replaceWith(doc.createTextNode(node.textContent || "")); return; }
      const attrs = Array.from(node.attributes);
      attrs.forEach((attr) => node.removeAttribute(attr.name));
      const original = Object.fromEntries(attrs.map((attr) => [attr.name.toLowerCase(), attr.value]));
      if (node.tagName === "A") {
        const href = String(original.href || "").trim();
        if (!/[\x00-\x20\\]/.test(href) && (/^https?:\/\/[^\s"'<>]+$/i.test(href) || /^tel:\+?[0-9]{7,15}$/i.test(href))) {
          node.setAttribute("href", href); node.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (node.tagName === "FONT" && original.color && validColor(original.color)) node.setAttribute("color", original.color.trim());
      const alignment = String(original.align || "").toLowerCase();
      if (["left", "right", "center", "justify"].includes(alignment) && ["P", "DIV", "TABLE", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "CENTER"].includes(node.tagName)) node.setAttribute("align", alignment);
      if (["TD", "TH"].includes(node.tagName)) ["colspan", "rowspan"].forEach((attr) => { const n = Number(original[attr]); if (Number.isInteger(n) && n >= 1 && n <= 12) node.setAttribute(attr, String(n)); });
      const styles = styleAllowed(original.style);
      if (styles) node.setAttribute("style", styles);
    });
    return doc.body.innerHTML.trim();
  }
  function visibleContent(html) {
    const doc = new DOMParser().parseFromString(safeHtml(html), "text/html");
    return (doc.body.textContent || "").replace(/&nbsp;|&#160;|&#xA0;/gi, " ").replace(/[\s\u200B\uFEFF]+/g, "").length > 0;
  }
  function propertyBytes(list) {
    const property = {};
    list.forEach((card, i) => { property[`card${i + 1}`] = { content: card.content, expiry: Math.max(0, Number(card.expiry) || 0) }; });
    return new TextEncoder().encode(JSON.stringify(property)).length;
  }
  function normalizeCards(data) {
    if (Array.isArray(data.cards)) return data.cards.map((card, i) => ({
      id: String(card && card.id || `card${i + 1}`),
      content: String(card && card.content || ""),
      expiry: card && card.expiry == null ? 0 : Number(card.expiry)
    })).filter((card) => card.content.trim() && Number.isFinite(card.expiry) && card.expiry >= 0 && Number.isInteger(card.expiry));
    const legacy = String(data.html || "");
    return legacy.trim() ? [{ id: "card1", content: legacy, expiry: 0 }] : [];
  }
  async function call(action, payload = {}) {
    if (!activeUser || activeUser.admin !== true) throw new Error("Administrator access is required.");
    const requestId = id();
    const response = await fetchWithTimeout(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
      body: JSON.stringify({ action, requestId, ...payload, username: activeUser.username, password: activeUser.password, installationId: getInstallationId(), sessionId: activeUser.sessionId || "" }),
      cache: "no-store", redirect: "follow"
    });
    if (!response.ok) throw new Error(`Request failed (HTTP ${response.status}).`);
    const data = await response.json();
    if (data.ok !== true || data.requestId !== requestId || data.action !== action) throw new Error(data.error || "The response could not be verified.");
    return data;
  }
  function currentExpiryInput() {
    const value = Number($("notificationCardExpiry")?.valueAsNumber);
    if (!Number.isFinite(value)) return 0;
    // datetime-local input represents local wall-clock time; convert explicitly to India time.
    const raw = $("notificationCardExpiry").value;
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return 0;
    const epoch = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+05:30`);
    return Number.isFinite(epoch) ? Math.floor(epoch / 1000) : 0;
  }
  function expiryToInput(epoch) {
    if (!epoch) return "";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epoch * 1000));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function editorContent() { return $("notificationCardHtmlEditor")?.value || ""; }
  function renderPreview() {
    const preview = $("notificationCardPreview"); if (!preview) return;
    const sanitized = safeHtml(editorContent());
    preview.replaceChildren();
    if (!visibleContent(sanitized)) { preview.textContent = "Preview will appear when the card contains visible content."; return; }
    preview.innerHTML = sanitized;
  }
  function setEditor(card) {
    selectedId = card ? card.id : null;
    $("notificationCardHtmlEditor").value = card ? card.content : "";
    $("notificationCardExpiry").value = card ? expiryToInput(card.expiry) : "";
    const label = $("notificationCardSelectedLabel");
    if (label) label.textContent = card ? `Editing ${card.id}` : "Creating a new card";
    updateCounter(); renderPreview(); renderCards();
  }
  function renderCards() {
    const list = $("notificationCardPublishedList"); if (!list) return;
    list.replaceChildren();
    if (!cards.length) { const empty = document.createElement("p"); empty.className = "field-hint"; empty.textContent = "No published cards. Create a card to publish an announcement."; list.appendChild(empty); }
    const now = Math.floor(Date.now() / 1000);
    cards.forEach((card) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "notification-card-item";
      button.classList.toggle("is-selected", card.id === selectedId);
      const title = document.createElement("strong"); title.textContent = card.id;
      const status = document.createElement("span"); status.textContent = card.expiry > 0 && card.expiry <= now ? "Expired" : card.expiry > 0 ? `Expires ${new Date(card.expiry * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "No expiry";
      button.append(title, status); button.disabled = busy; button.addEventListener("click", () => setEditor(card)); list.appendChild(button);
    });
    const del = $("notificationCardDeleteButton"); if (del) del.disabled = busy || !selectedId || !cards.some((x) => x.id === selectedId);
  }
  function updateCounter() {
    const editor = $("notificationCardHtmlEditor"); const counter = $("notificationCardCharacterCount");
    if (counter && editor) { counter.textContent = `${editor.value.length} / ${MAX_CHARS} HTML-source characters`; counter.dataset.overLimit = String(editor.value.length > MAX_CHARS); }
    const save = $("notificationCardPublishButton");
    if (save) save.disabled = busy || !verified || !editor || !editor.value.trim() || editor.value.length > MAX_CHARS || !visibleContent(editor.value);
  }
  function setBusy(value) {
    busy = value;
    ["notificationCardRefreshButton", "notificationCardNewButton", "notificationCardDeleteButton", "notificationCardPublishButton", "notificationCardHtmlEditor", "notificationCardExpiry", "notificationCardNeverExpiry"].forEach((key) => { const el = $(key); if (el) el.disabled = value || ((key === "notificationCardPublishButton" || key === "notificationCardNewButton" || key === "notificationCardHtmlEditor" || key === "notificationCardExpiry" || key === "notificationCardNeverExpiry") && !verified); });
    renderCards(); updateCounter();
  }
  async function refresh() {
    if (busy || !activeUser || activeUser.admin !== true) return;
    setBusy(true); verified = false; setStatus("Loading published notification cards…");
    try {
      const data = await call("getAdminNotificationCard");
      if (!(Array.isArray(data.cards) || typeof data.html === "string")) throw new Error("The response did not contain a published card list or legacy HTML value.");
      cards = normalizeCards(data);
      if (cards.length > MAX_CARDS || cards.some((x) => x.content.length > MAX_CHARS) || propertyBytes(cards) > MAX_PROPERTY_BYTES) throw new Error("The server returned card data outside the Android-supported limits. Editing is disabled until this is resolved.");
      verified = true;
      const chosen = cards.find((x) => x.id === selectedId) || cards[0] || null;
      setEditor(chosen);
      setStatus(`Verified ${cards.length} published card${cards.length === 1 ? "" : "s"}.`, "success");
    } catch (error) { setStatus(error?.message || "Unable to load published cards. Retry before editing.", "error"); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (busy || !verified) return;
    const raw = editorContent();
    if (raw.length > MAX_CHARS) { setStatus(`Card source is limited to ${MAX_CHARS} characters.`, "error"); return; }
    const content = safeHtml(raw);
    if (!visibleContent(content)) { setStatus("Enter visible announcement content before publishing.", "error"); return; }
    if (content.length > MAX_CHARS) { setStatus("Sanitized HTML exceeds the 3,900-character limit.", "error"); return; }
    const next = cards.slice();
    const index = next.findIndex((x) => x.id === selectedId);
    const draft = { id: selectedId || "draft", content, expiry: currentExpiryInput() };
    if (index >= 0) next[index] = draft; else next.push(draft);
    if (next.length > MAX_CARDS) { setStatus("A maximum of 100 published cards is supported.", "error"); return; }
    if (propertyBytes(next) > MAX_PROPERTY_BYTES) { setStatus("Combined card configuration exceeds the 8,000-byte storage limit. Shorten content or remove cards.", "error"); return; }
    setBusy(true); setStatus("Publishing and verifying saved cards…");
    try {
      const data = await call("saveNotificationCard", { cards: next.map((x) => ({ id: x.id, content: x.content, expiry: x.expiry })) });
      if (!Array.isArray(data.cards)) throw new Error("Save was not confirmed with the saved card list.");
      const saved = normalizeCards(data);
      if (saved.length !== next.length || saved.some((x, i) => x.content !== next[i].content || Number(x.expiry) !== Number(next[i].expiry))) throw new Error("Backend acknowledged the save but returned a different card set. Refresh to inspect current state.");
      cards = saved; verified = true; setEditor(saved[index >= 0 ? index : saved.length - 1] || null);
      setStatus("Published notification cards saved and response verified. Home display eligibility follows expiry and visible-content rules.", "success");
    } catch (error) { verified = false; setStatus(error?.message || "Save could not be confirmed. Refresh before retrying.", "error"); }
    finally { setBusy(false); }
  }
  async function removeSelected() {
    if (busy || !verified || !selectedId) return;
    const selected = cards.find((x) => x.id === selectedId); if (!selected) return;
    if (!window.confirm(`Delete published notification card ${selected.id}? This removes it from the published set.`)) return;
    const next = cards.filter((x) => x.id !== selectedId);
    if (propertyBytes(next) > MAX_PROPERTY_BYTES) { setStatus("The remaining card set exceeds the supported storage limit.", "error"); return; }
    setBusy(true); setStatus("Deleting selected published card…");
    try {
      const data = await call("saveNotificationCard", { cards: next.map((x) => ({ id: x.id, content: x.content, expiry: x.expiry })) });
      if (!Array.isArray(data.cards)) throw new Error("Deletion was not confirmed with the resulting card list.");
      const saved = normalizeCards(data);
      if (saved.length !== next.length || saved.some((x, i) => x.id !== next[i].id)) throw new Error("Deletion response did not match the requested result. Refresh to verify.");
      cards = saved; verified = true; setEditor(cards[0] || null); setStatus(cards.length ? "Selected card deleted; remaining published cards verified." : "All published notification cards deleted.", "success");
    } catch (error) { verified = false; setStatus(error?.message || "Deletion could not be confirmed. Refresh to verify.", "error"); }
    finally { setBusy(false); }
  }
  function wrapSelection(open, close) {
    const input = $("notificationCardHtmlEditor"); if (!input || busy) return;
    const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
    input.setRangeText(open + input.value.slice(start, end) + close, start, end, "select");
    input.focus(); updateCounter(); renderPreview();
  }
  function initialize() {
    const panel = $("notificationCardManagementPanel"); if (!panel) return;
    const admin = !!(activeUser && activeUser.admin === true); panel.hidden = !admin;
    if (!admin) return;
    const key = `${activeUser.username || ""}|${activeUser.sessionId || ""}`;
    if (sessionKey && sessionKey !== key) { verified = false; cards = []; selectedId = null; }
    sessionKey = key;
    if (!initialized) {
      initialized = true;
      $("notificationCardRefreshButton")?.addEventListener("click", refresh);
      $("notificationCardNewButton")?.addEventListener("click", () => { if (verified && !busy) setEditor(null); });
      $("notificationCardPublishButton")?.addEventListener("click", publish);
      $("notificationCardDeleteButton")?.addEventListener("click", removeSelected);
      $("notificationCardHtmlEditor")?.addEventListener("input", () => { updateCounter(); renderPreview(); });
      $("notificationCardExpiry")?.addEventListener("change", () => { setStatus("Expiry updated in the editor. Publish to apply it."); });
      $("notificationCardNeverExpiry")?.addEventListener("click", () => { $("notificationCardExpiry").value = ""; setStatus("Expiry cleared. Publish to make the card non-expiring."); });
      document.querySelectorAll("[data-card-wrap]").forEach((button) => button.addEventListener("click", () => wrapSelection(button.dataset.openTag, button.dataset.closeTag)));
    }
    if (!verified) refresh();
  }
  window.NeuronNotificationCardManagement = Object.freeze({ initialize, refresh });
})();
