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

  function isEEGPatient(p) {
    return p?.eegCharges !== null && p?.eegCharges !== undefined && p?.eegCharges !== "";
  }

  function eegPatients(patients) {
    return (Array.isArray(patients) ? patients : []).filter(isEEGPatient);
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
    return U.money(Number(p?.eegTotalPaid) || 0);
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
    const el = $("eegTodayStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = `eeg-today-status${kind ? ` is-${kind}` : ""}`;
    el.hidden = !text;
  }

  function render(record) {
    const list = $("eegTodayList");
    if (!list) return;
    const patients = sortPatients(eegPatients(record?.patients));
    if (!patients.length) {
      list.innerHTML = '<div class="opd-today-empty">No EEG patients found for today.</div>';
      return;
    }
    list.innerHTML = patients.map((p, i) => {
      const age = ageText(p);
      return `<div class="opd-today-row"><span class="opd-today-card-line1"><span class="opd-today-number">${i + 1}</span><span class="opd-today-name"><b>${esc(p?.name || "")}</b></span>${age ? `<span class="opd-today-age">${esc(age)}</span>` : ""}</span><span class="opd-today-card-line2"><span class="opd-today-payment">EEG : ${esc(paidText(p))}</span></span></div>`;
    }).join("");
  }

  function setLastUpdated(record) {
    const el = $("eegTodayLastUpdated");
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

  async function openPopup() {
    const m = $("eegTodayPopup");
    if (!m) return;
    const city = currentCity();
    const date = todayKey();
    popupState.open = true;
    popupState.city = city;
    popupState.key = city ? cacheKey(date, city) : "";
    m.hidden = false;
    document.body.classList.add("eeg-today-modal-open");
    setStatus("", "");
    setLastUpdated(null);
    if (!city) {
      $("eegTodayList").innerHTML = `<div class="eeg-today-empty">Today's EEG city is not selected.</div>`;
      return;
    }
    $("eegTodayList").innerHTML = '<div class="eeg-today-loading">Loading…</div>';
    try {
      const record = await IDB.getTodayOPDCache_(city);
      render(record);
      setLastUpdated(record);
      showCacheStatus(record);
    } catch (_) {
      $("eegTodayList").innerHTML = '<div class="eeg-today-empty">Unable to retrieve today’s EEG list.</div>';
    }
  }

  function closePopup() {
    const m = $("eegTodayPopup");
    if (m) m.hidden = true;
    popupState.open = false;
    document.body.classList.remove("eeg-today-modal-open");
  }

  async function handleUpdate() {
    const city = currentCity();
    const date = todayKey();
    if (!city) { setStatus("Today's EEG city is not selected.", "warning"); return; }
    popupState.city = city;
    popupState.key = cacheKey(date, city);
    if (popupState.updating) return;
    popupState.updating = true;
    setStatus("Updating from server…", "working");
    const previous = await IDB.get("cache", popupState.key).catch(() => null);
    try {
      const record = await IDB.getTodayOPDCache_(city, {forceRefresh:true});
      render(record);
      setLastUpdated(record);
      showCacheStatus(record);
    } catch (e) {
      if (previous) {
        render(previous);
        setLastUpdated(previous);
        showCacheStatus(previous);
      } else {
        setStatus(e?.message || "Unable to update patient list.", "warning");
      }
    } finally {
      popupState.updating = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const section = document.querySelector(".portal-section-eeg");
    if (!section) return;
    section.querySelector(".portal-section-title")?.addEventListener("click", openPopup);
    section.querySelector(".portal-section-title")?.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); openPopup(); } });
    section.querySelectorAll(".portal-action").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
    $("eegTodayUpdate")?.addEventListener("click", handleUpdate);
    $("eegTodayOk")?.addEventListener("click", closePopup);
    $("eegTodayBackdrop")?.addEventListener("click", closePopup);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && popupState.open) closePopup(); });
  });
})();
