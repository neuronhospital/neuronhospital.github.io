(() => {
  const CACHE_PREFIX = "OPD_TODAY|";
  const popupState = { open: false, city: "", key: "", updating: false };

  const esc = v => U.esc(v == null ? "" : v);
  const todayKey = () => {
    const p = U.parts();
    return `${p.y}${String(p.m).padStart(2, "0")}${String(p.d).padStart(2, "0")}`;
  };
  const cacheKey = (date, city) => `${CACHE_PREFIX}${date}|${city}`;

  function currentCity() {
    return String(window.TodayCity?.resolve?.() || "").trim();
  }

  function ageText(p) {
    const age = p?.age;
    const n = Number(age);
    const value = Number.isFinite(n) ? String(age) : String(age ?? "").trim();
    const unit = String(p?.ageUnit || "").trim().toLowerCase();
    if (!value) return "";
    const labels = { days: n === 1 ? "Day" : "Days", months: n === 1 ? "Month" : "Months", years: n === 1 ? "Year" : "Years" };
    return `${value} ${labels[unit] || unit}`.trim();
  }

  function paidText(p) {
    const paid = Number(p?.opdTotalPaid);
    const charges = Number(p?.opdCharges);
    const amount = Number.isFinite(paid) ? paid : (Number.isFinite(charges) ? charges : 0);
    return U.money(amount);
  }

  function eegBooked(p) {
    return window.NeuronPatientActionRules?.hasBookedEEG?.(p) === true;
  }

  function nonNegativeAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function paymentMeta(p) {
    const items = [`OPD : ${paidText(p)}`];

    if (eegBooked(p)) {
      const eegPaid = nonNegativeAmount(p?.eegTotalPaid);
      if (eegPaid !== null) items.push(`EEG : ${U.money(eegPaid)}`);
    }

    const opdRefund = p?.opdRefundProvided === true ? (nonNegativeAmount(p?.opdRefund) ?? 0) : 0;
    const eegRefund = p?.eegRefundProvided === true ? (nonNegativeAmount(p?.eegRefund) ?? 0) : 0;
    const refundTotal = opdRefund + eegRefund;
    let refund = "";
    if (refundTotal > 0) {
      const breakdown = [
        opdRefund > 0 ? `O${opdRefund}` : "",
        eegRefund > 0 ? `E${eegRefund}` : ""
      ].filter(Boolean).join("+");
      refund = `Refund : ${U.money(refundTotal)} (${breakdown})`;
    }

    const allThree = items.length === 2 && !!refund;
    return {
      inline: refund && !allThree ? [...items, refund] : items,
      mobileThirdLine: allThree ? refund : ""
    };
  }

  function serialOf(id) {
    const m = String(id || "").match(/-(\d+)$/);
    return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
  }

  function sortPatients(patients) {
    return [...(Array.isArray(patients) ? patients : [])].sort((a, b) => {
      const sa = serialOf(a?.appointmentId), sb = serialOf(b?.appointmentId);
      if (sa !== sb) return sa - sb;
      return String(a?.time || "").localeCompare(String(b?.time || ""));
    });
  }

  function setStatus(text, kind = "") {
    const el = $("opdTodayStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = `opd-today-status${kind ? ` is-${kind}` : ""}`;
    el.hidden = !text;
  }

  function render(record) {
    const list = $("opdTodayList");
    if (!list) return;
    const patients = sortPatients(record?.patients || []);
    if (!patients.length) {
      list.innerHTML = '<div class="opd-today-empty">No OPD patients found for today.</div>';
      return;
    }
    list.innerHTML = patients.map((p, i) => {
      const age = ageText(p);
      const meta = paymentMeta(p);
      const inline = meta.inline.map((item, index) => {
        const isRefund = index === meta.inline.length - 1 && String(item).startsWith("Refund :");
        const thirdLineMobile = isRefund && meta.mobileThirdLine;
        const cls = thirdLineMobile ? "opd-today-payment opd-today-refund-inline is-third-line-mobile" : "opd-today-payment";
        const separator = index ? `<span class="opd-today-separator${thirdLineMobile ? " is-third-line-mobile-separator" : ""}" aria-hidden="true">•</span>` : "";
        return `${separator}<span class="${cls}">${esc(item)}</span>`;
      }).join("");
      const thirdLine = meta.mobileThirdLine ? `<span class="opd-today-card-line3"><span class="opd-today-payment">${esc(meta.mobileThirdLine)}</span></span>` : "";
      return `<button type="button" class="opd-today-row" data-appointment-id="${esc(p?.appointmentId || "")}"><span class="opd-today-card-line1"><span class="opd-today-number">${i + 1}</span><span class="opd-today-name"><b>${esc(p?.name || "")}</b></span>${age ? `<span class="opd-today-age">${esc(age)}</span>` : ""}</span><span class="opd-today-card-line2">${inline}</span>${thirdLine}</button>`;
    }).join("");
    list.querySelectorAll("[data-appointment-id]").forEach(row => row.addEventListener("click", () => {
      const id=String(row.dataset.appointmentId||"");
      const patient=patients.find(x=>String(x?.appointmentId||"")===id);
      if(patient) window.NeuronPatientAction?.open?.(patient);
    }));
  }

  function setLastUpdated(record) {
    const el = $("opdTodayLastUpdated");
    if (!el) return;
    const ts = Number(record?.lastServerRefreshAt || 0);
    if (!ts) { el.hidden = true; el.textContent = ""; return; }
    const d = new Date(ts);
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    el.textContent = `Last updated: ${time}`;
    el.hidden = false;
  }

  function showCacheStatus(record) {
    const status = String(record?.status || "");
    const stale = window.IDB?.opdTodayCacheStale_?.(record, record?.patients, "appointmentId") === true;
    if (status === "CACHED_INCOMPLETE" || status === "STALE" || stale) {
      setStatus("⚠ This list is not up to date. Please Update.", "warning");
    } else if (status === "REFRESHING") {
      setStatus("Updating from server…", "working");
    } else if (status === "REFRESHED") {
      setStatus("Server refreshed • Local cache updated", "success");
    } else {
      setStatus("Local cache • Up to date", "success");
    }
  }

  async function refresh(city, existingRecord = null) {
    if (popupState.updating) return existingRecord || await IDB.get("cache", popupState.key).catch(() => null);
    popupState.updating = true;
    setStatus("Updating from server…", "working");
    try {
      const record = await IDB.getTodayOPDCache_(city, {forceRefresh:true});
      render(record);
      setLastUpdated(record);
      showCacheStatus(record);
      return record;
    } catch (e) {
      const previous = existingRecord || await IDB.get("cache", popupState.key).catch(() => null);
      if (previous) {
        render(previous);
        setLastUpdated(previous);
        showCacheStatus(previous);
      } else {
        setStatus(e?.message || "Unable to update patient list.", "warning");
      }
      throw e;
    } finally {
      popupState.updating = false;
    }
  }

  async function openPopup() {
    const m = $("opdTodayPopup");
    if (!m) return;
    const city = currentCity();
    const date = todayKey();
    popupState.open = true;
    popupState.city = city;
    popupState.key = city ? cacheKey(date, city) : "";
    m.hidden = false;
    document.body.classList.add("opd-today-modal-open");
    setStatus("", "");
    setLastUpdated(null);
    if (!city) {
      $("opdTodayList").innerHTML = `<div class="opd-today-empty">Today's OPD city is not selected.</div>`;
      return;
    }
    $("opdTodayList").innerHTML = '<div class="opd-today-loading">Loading…</div>';
    try {
      const record = await IDB.getTodayOPDCache_(city);
      render(record);
      setLastUpdated(record);
      showCacheStatus(record);
    } catch (_) {
      $("opdTodayList").innerHTML = '<div class="opd-today-empty">Unable to retrieve today’s OPD list.</div>';
    }
  }

  function closePopup() {
    const m = $("opdTodayPopup");
    if (m) m.hidden = true;
    popupState.open = false;
    document.body.classList.remove("opd-today-modal-open");
  }

  async function refreshFromCurrentCache() {
    const city = currentCity();
    const date = todayKey();
    if (!city) return;
    popupState.city = city;
    popupState.key = cacheKey(date, city);
    const record = await IDB.get("cache", popupState.key).catch(() => null);
    if (!record) return;
    render(record);
    setLastUpdated(record);
    showCacheStatus(record);
  }

  async function handleUpdate() {
    const city = currentCity();
    const date = todayKey();
    if (!city) { setStatus("Today's OPD city is not selected.", "warning"); return; }
    popupState.city = city;
    popupState.key = cacheKey(date, city);
    const previous = await IDB.get("cache", popupState.key).catch(() => null);
    try { await refresh(city, previous); } catch (_) {}
  }


  document.addEventListener("DOMContentLoaded", () => {
    const section = document.querySelector(".portal-section-opd");
    if (!section) return;
    section.querySelector(".opd-patient-list-trigger")?.addEventListener("click", openPopup);
    section.querySelector(".opd-patient-list-trigger")?.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); openPopup(); } });
    section.querySelectorAll(".portal-action").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
    $("opdTodayUpdate")?.addEventListener("click", handleUpdate);
    $("opdTodayOk")?.addEventListener("click", closePopup);
    $("opdTodayBackdrop")?.addEventListener("click", closePopup);
    window.addEventListener("neuron:refresh-opd-today", () => { if (popupState.open) refreshFromCurrentCache().catch(() => {}); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && popupState.open) closePopup(); });
  });
})();
