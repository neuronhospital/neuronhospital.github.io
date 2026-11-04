/* Phase 8.1 — PreBooking form, date eligibility, and create request. */
(function (root) {
  "use strict";

  const CITIES = ["Latur", "Nilanga", "Udgir", "Beed", "Ambajogai", "Dharashiv", "Omerga", "Barshi"];
  const AGE_UNITS = ["Days", "Months", "Years"];
  const ZONE = "Asia/Kolkata";
  let initialized = false;
  let submitting = false;
  let selectedDate = ""; // canonical yyyyMMdd
  let visibleMonth = ""; // yyyy-MM
  let calendarOpen = false;
  let cityOptions = [];

  const $ = (id) => document.getElementById(id);
  const form = () => $("prebookingForm");

  function dateParts(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return { year: y, month: Number(m), day: Number(d), iso: `${y}-${m}-${d}`, key: `${y}${m}${d}` };
  }

  function todayParts() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { year: Number(value.year), month: Number(value.month), day: Number(value.day), iso: `${value.year}-${value.month}-${value.day}`, key: `${value.year}${value.month}${value.day}` };
  }

  function dateFromKey(key) {
    if (!/^\d{8}$/.test(String(key || ""))) return null;
    const y = Number(key.slice(0, 4)), m = Number(key.slice(4, 6)), d = Number(key.slice(6, 8));
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
  }

  function formatDate(key, options = { weekday: "long", day: "2-digit", month: "long", year: "numeric" }) {
    const date = dateFromKey(key);
    return date ? new Intl.DateTimeFormat("en-IN", { ...options, timeZone: ZONE }).format(date) : "";
  }

  function monthKey(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
  function parseMonth(key) { const [y, m] = String(key || "").split("-").map(Number); return new Date(Date.UTC(y || 2000, (m || 1) - 1, 1)); }
  function weekOfMonth(date) { return Math.floor((date.getUTCDate() - 1) / 7) + 1; }

  function cityScheduledOn(city, date) {
    const p = dateParts(date);
    return typeof scheduledToday === "function" && scheduledToday(city, p);
  }

  function getSpecialAccess() {
    const config = typeof opdConfig !== "undefined" ? opdConfig : null;
    const special = config && config.specialAccess;
    if (!special || special.enabled !== true || !CITIES.includes(normalizeCity(special.city))) return null;
    const iso = String(special.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso || iso < todayParts().iso) return null;
    return { city: normalizeCity(special.city), date, key: dateParts(date).key, iso };
  }

  function cancelledKeys(city) {
    const config = typeof opdConfig !== "undefined" ? opdConfig : null;
    const collection = config && config.doctorVisitCancelled;
    const dates = collection && collection[city];
    return new Set(Array.isArray(dates) ? dates.map((value) => String(value).trim()).filter((value) => /^\d{8}$/.test(value)) : []);
  }

  function nextScheduledDates(city, today) {
    const count = city === "Latur" ? 7 : 3;
    const dates = [];
    const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
    for (let i = 0; i < 366 && dates.length < count; i += 1) {
      if (cityScheduledOn(city, cursor)) dates.push(dateParts(cursor).key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates.length === count ? dates : [];
  }

  function selectableDates(city) {
    const today = todayParts();
    const ordinary = nextScheduledDates(city, today);
    const special = getSpecialAccess();
    if (special && special.city === city && special.key >= today.key) ordinary.push(special.key);
    const cancelled = cancelledKeys(city);
    return [...new Set(ordinary)].filter((key) => key >= today.key && !cancelled.has(key)).sort();
  }

  function accountCities() {
    const user = typeof activeUser !== "undefined" ? activeUser : null;
    if (!user || user.admin === true) return CITIES.slice();
    const assigned = normalizeCity(user.city);
    if (!CITIES.includes(assigned)) return [];
    if (assigned === "Latur") return CITIES.slice();
    const special = getSpecialAccess();
    return [...new Set([assigned, ...(special ? [special.city] : [])])];
  }

  function showError(field, message) {
    const control = $("prebooking" + field.charAt(0).toUpperCase() + field.slice(1));
    const error = $("prebooking" + field.charAt(0).toUpperCase() + field.slice(1) + "Error");
    if (error) { error.textContent = message || ""; error.hidden = !message; }
    if (control) {
      if (message) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
  }

  function clearErrors() {
    ["Name", "Age", "Address", "Whatsapp", "VerifyWhatsapp", "City", "Date"].forEach((name) => {
      const el = $("prebooking" + name + "Error");
      if (el) { el.textContent = ""; el.hidden = true; }
      const control = $("prebooking" + name);
      if (control) control.removeAttribute("aria-invalid");
    });
    if ($("prebookingFormError")) $("prebookingFormError").textContent = "";
  }

  function validate() {
    clearErrors();
    const name = $("prebookingName").value.trim();
    const rawAge = $("prebookingAge").value.trim();
    const age = Number(rawAge);
    const unit = $("prebookingAgeUnit").value;
    const address = $("prebookingAddress").value.trim();
    const mobile = $("prebookingWhatsapp").value.trim();
    const verify = $("prebookingVerifyWhatsapp").value.trim();
    const city = $("prebookingCity").value;
    let valid = true;
    if (!name) { showError("name", "Patient name is required."); valid = false; }
    if (!/^\d+(?:\.\d+)?$/.test(rawAge) || !Number.isFinite(age) || age < 0) { showError("age", "Enter a valid non-negative numeric age."); valid = false; }
    if (!AGE_UNITS.includes(unit)) { showError("age", "Select Days, Months, or Years."); valid = false; }
    if (!address) { showError("address", "Address is required."); valid = false; }
    if (!/^[6-9]\d{9}$/.test(mobile)) { showError("whatsapp", "Enter a valid 10-digit Indian mobile number."); valid = false; }
    if (!/^[6-9]\d{9}$/.test(verify)) { showError("verifyWhatsapp", "Enter the 10-digit verification number."); valid = false; }
    else if (mobile !== verify) { showError("verifyWhatsapp", "The WhatsApp numbers do not match."); valid = false; }
    if (!cityOptions.includes(city)) { showError("city", "Select a permitted visiting city."); valid = false; }
    const eligible = selectableDates(city);
    if (!selectedDate || !eligible.includes(selectedDate)) { showError("date", "Select an available visiting date."); valid = false; }
    return valid ? { name, age: normalizeAge(rawAge), unit, address, mobile, city, date: selectedDate } : null;
  }

  function normalizeAge(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value).trim();
    return number.toString();
  }

  function updateDateDisplay() {
    const button = $("prebookingDateDisplay");
    if (button) button.textContent = selectedDate ? formatDate(selectedDate) : "No eligible date available";
  }

  function refreshCityChoices(preserve = true) {
    const select = $("prebookingCity");
    if (!select) return;
    const previous = preserve ? select.value : "";
    cityOptions = accountCities();
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "Select Visiting City"; select.append(placeholder);
    cityOptions.forEach((city) => { const option = document.createElement("option"); option.value = city; option.textContent = city; select.append(option); });
    const preferred = (() => { try { return localStorage.getItem("neuronPreBookingCity") || ""; } catch (_) { return ""; } })();
    select.value = cityOptions.includes(previous) ? previous : cityOptions.includes(preferred) ? preferred : cityOptions[0] || "";
    if ($("prebookingCityHint")) {
      const user = typeof activeUser !== "undefined" ? activeUser : null;
      $("prebookingCityHint").textContent = user && user.admin !== true && normalizeCity(user.city) !== "Latur"
        ? "Your account is limited to its assigned city and an active Special Access city."
        : "City options follow your account access.";
    }
    refreshDatesForCity();
  }

  function refreshDatesForCity() {
    const city = $("prebookingCity") ? $("prebookingCity").value : "";
    const dates = selectableDates(city);
    if (!dates.includes(selectedDate)) selectedDate = dates[0] || "";
    visibleMonth = selectedDate ? monthKey(dateFromKey(selectedDate)) : monthKey(new Date(Date.UTC(todayParts().year, todayParts().month - 1, 1)));
    updateDateDisplay();
    renderCalendar();
  }

  function renderCalendar() {
    const rootDays = $("prebookingCalendarDays");
    const title = $("prebookingCalendarTitle");
    if (!rootDays || !title) return;
    rootDays.replaceChildren();
    const month = parseMonth(visibleMonth);
    title.textContent = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: ZONE }).format(month);
    const firstOffset = (month.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const city = $("prebookingCity").value;
    const eligible = new Set(selectableDates(city));
    const ordinaryEligible = new Set(nextScheduledDates(city, todayParts()));
    const special = getSpecialAccess();
    const cancelled = cancelledKeys(city);
    for (let i = 0; i < firstOffset; i += 1) { const blank = document.createElement("span"); blank.className = "prebooking-calendar-blank"; rootDays.append(blank); }
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
      const key = dateParts(date).key;
      const isCancelled = cancelled.has(key);
      const isScheduled = ordinaryEligible.has(key);
      const isSpecial = !!special && special.city === city && special.key === key;
      const allowed = key >= todayParts().key && eligible.has(key) && !isCancelled;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "prebooking-calendar-day" + (isCancelled ? " is-cancelled" : isSpecial ? " is-special" : isScheduled ? " is-scheduled" : "") + (key === selectedDate ? " is-selected" : "");
      button.textContent = String(day);
      button.disabled = !allowed;
      button.setAttribute("aria-label", formatDate(key) + (isCancelled ? ", cancelled" : isSpecial ? ", Special Mode" : isScheduled ? ", scheduled" : ", unavailable") + (key === selectedDate ? ", selected" : ""));
      if (allowed) button.addEventListener("click", () => {
        selectedDate = key;
        updateDateDisplay(); renderCalendar(); showError("date", "");
        const hint = $("prebookingDateHint"); if (hint) hint.textContent = isSpecial ? "This date is enabled by Special Day Mode." : "This date is within the next scheduled visit dates.";
        closeCalendar();
      });
      rootDays.append(button);
    }
    const message = $("prebookingCalendarMessage");
    if (message) message.textContent = eligible.size ? `Choose one of the available dates for ${city}.` : `No eligible dates are available for ${city}. Verify schedule configuration or choose another city.`;
    const prev = $("prebookingPrevMonth"), next = $("prebookingNextMonth");
    const allDates = [...eligible, ...cancelled].filter((key) => key >= todayParts().key).map(dateFromKey).filter(Boolean).map(monthKey);
    const months = [...new Set(allDates)].sort();
    const idx = months.indexOf(visibleMonth);
    if (prev) prev.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= months.length - 1;
  }

  function openCalendar() {
    calendarOpen = true;
    const panel = $("prebookingCalendar");
    panel.hidden = false;
    $("prebookingDateDisplay").setAttribute("aria-expanded", "true");
    renderCalendar();
  }
  function closeCalendar() {
    calendarOpen = false;
    $("prebookingCalendar").hidden = true;
    $("prebookingDateDisplay").setAttribute("aria-expanded", "false");
  }

  function resetForm() {
    form().reset();
    $("prebookingAgeUnit").value = "Years";
    selectedDate = "";
    const result = $("prebookingResult"); result.hidden = true; result.replaceChildren();
    clearErrors();
    refreshDatesForCity();
    closeCalendar();
  }

  function showMutation(mutation) {
    const result = $("prebookingResult");
    result.hidden = false; result.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = mutation.status === "CONFIRMED" ? "PreBooking confirmed" : mutation.status === "FAILED" ? "PreBooking rejected" : "PreBooking request saved";
    result.append(heading);
    window.NeuronMutations.renderStatus(result, mutation, { payment: false });
    const details = document.createElement("p");
    details.textContent = mutation.status === "CONFIRMED"
      ? `Appointment ID: ${mutation.appointmentId || "Confirmed"}. Keep this ID for reference.`
      : mutation.errorMessage || "The request is retained locally. Do not submit a new request until the original result is resolved.";
    result.append(details);
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const values = validate();
    if (!values) { const first = form().querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }
    if (!window.NeuronMutations || !window.NeuronStorage) {
      $("prebookingFormError").textContent = "Local request storage is unavailable. Please reload before submitting."; return;
    }
    submitting = true;
    const button = $("prebookingSubmitButton"); button.disabled = true; button.textContent = "Submitting…";
    try {
      await window.NeuronDataReady;
      const requestId = "PB_" + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID().replace(/-/g, "") : makeRequestId().replace(/[^A-Za-z0-9]/g, "").toUpperCase());
      const payload = {
        action: "PREBOOKING_CREATE",
        prebookingRequestId: requestId,
        patientName: values.name,
        age: values.age,
        ageUnit: values.unit,
        address: values.address,
        mobileNumber: values.mobile,
        visitingCity: values.city,
        visitingDate: values.date,
        sourceFcmToken: "",
        installationId: getInstallationId()
      };
      await window.NeuronMutations.create({ requestId, mutationId: window.NeuronMutations.newMutationId(), eventType: "PREBOOKING_CREATE", scope: "prebooking", city: values.city, date: values.date, payload });
      const envelope = await window.NeuronMutations.retryEnvelope(requestId);
      let response;
      try {
        response = await fetchWithTimeout(BACKEND_URL, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", "Cache-Control": "no-cache" },
          body: JSON.stringify(envelope.payload), cache: "no-store", redirect: "follow"
        });
        let body = null; try { body = await response.json(); } catch (_) {}
        await window.NeuronMutations.classifyTransportResult(requestId, { ok: response.ok }, body);
      } catch (networkError) {
        await window.NeuronMutations.markUnknown(requestId, "The connection ended before confirmation. The same PreBooking Request ID is retained; do not create another request.");
      }
      const saved = await window.NeuronMutations.get(requestId);
      if (saved) showMutation(saved);
      if (saved && saved.status === "CONFIRMED") showToast("PreBooking confirmation received.");
      else showToast("PreBooking request saved; result is not yet verified.");
    } catch (error) {
      $("prebookingFormError").textContent = error && error.message ? error.message : "Unable to save this PreBooking request.";
    } finally {
      submitting = false; button.disabled = false; button.innerHTML = 'Submit PreBooking <span aria-hidden="true">→</span>';
    }
  }

  function initialize() {
    if (initialized) { refreshCityChoices(true); return; }
    if (!form()) return;
    initialized = true;
    $("prebookingBackButton").addEventListener("click", () => setView("home"));
    $("prebookingCity").addEventListener("change", () => {
      const city = $("prebookingCity").value;
      try { localStorage.setItem("neuronPreBookingCity", city); } catch (_) {}
      refreshDatesForCity(); showError("city", "");
    });
    $("prebookingDateDisplay").addEventListener("click", openCalendar);
    $("prebookingCalendarClose").addEventListener("click", closeCalendar);
    $("prebookingPrevMonth").addEventListener("click", () => { const date = parseMonth(visibleMonth); date.setUTCMonth(date.getUTCMonth() - 1); visibleMonth = monthKey(date); renderCalendar(); });
    $("prebookingNextMonth").addEventListener("click", () => { const date = parseMonth(visibleMonth); date.setUTCMonth(date.getUTCMonth() + 1); visibleMonth = monthKey(date); renderCalendar(); });
    $("prebookingResetButton").addEventListener("click", resetForm);
    form().addEventListener("submit", submit);
    refreshCityChoices(false);
    if (typeof root.initializePreBookingPatientList === "function") root.initializePreBookingPatientList();
  }

  function refreshEligibility() {
    if (!initialized) return;
    refreshCityChoices(true);
  }

  root.initializePreBookingFeature = initialize;
  root.refreshPreBookingEligibility = refreshEligibility;
})(typeof window !== "undefined" ? window : globalThis);
