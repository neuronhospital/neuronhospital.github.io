(() => {
  const CTX_KEY = "neuron_selected_today_patient_v1";
  let selectedTodayPatient = null;
  let currentAction = "";

  const esc = v => U.esc(v == null ? "" : v);
  const ageText = p => {
    const n = Number(p?.age), value = Number.isFinite(n) ? String(p.age) : String(p?.age ?? "").trim();
    const unit = String(p?.ageUnit || "").trim().toLowerCase();
    if (!value) return "";
    const labels = {days:n===1?"Day":"Days",months:n===1?"Month":"Months",years:n===1?"Year":"Years"};
    return `${value} ${labels[unit] || unit}`.trim();
  };
  const rules = window.NeuronPatientActionRules;
  const actionsFor = p => rules?.availableActions?.(p) || [];
  const refundEligibility = p => rules?.refundAvailability?.(p) || {opd:false,eeg:false};
  const formUrl = key => ({OPD_UPDATE:"opd_update.html",BOOK_EEG:"eeg_booking.html",UPDATE_EEG:"eeg_update.html",REFUND:"refund.html"}[key] || "");
  const modal = () => $("patientActionPopup");
  const formModal = () => $("patientActionFormPopup");

  function setContext(p, action="") {
    selectedTodayPatient = p ? {...p} : null;
    if (selectedTodayPatient) {
      const r = refundEligibility(selectedTodayPatient);
      selectedTodayPatient.refundAvailable = r;
      try { sessionStorage.setItem(CTX_KEY, JSON.stringify({patient:selectedTodayPatient,action})); } catch (_) {}
    }
  }
  function clearContext() {
    selectedTodayPatient = null;
    try { sessionStorage.removeItem(CTX_KEY); } catch (_) {}
  }
  function renderActions() {
    const body = $("patientActionBody"); if (!body || !selectedTodayPatient) return;
    const actions = actionsFor(selectedTodayPatient);
    body.innerHTML = actions.length ? actions.map(a => `<button type="button" class="patient-action-card" data-action="${esc(a.key)}"><span>${esc(a.label)}</span></button>`).join("") : '<div class="patient-action-empty">No action is currently available for this patient.</div>';
    body.querySelectorAll("[data-action]").forEach(b => b.addEventListener("click", () => openAction(b.dataset.action)));
  }
  function openPatient(p) {
    setContext(p);
    const m = modal(); if (!m) return;
    $("patientActionTitle").textContent = p?.name || "Patient";
    $("patientActionAge").textContent = ageText(p);
    renderActions();
    m.hidden = false;
    document.body.classList.add("patient-action-open");
    requestAnimationFrame(() => $("patientActionBody")?.querySelector("[data-action]")?.focus());
  }
  function closePatient() {
    const m = modal(); if (m) m.hidden = true;
    const fm = formModal(); if (fm) fm.hidden = true;
    const f = $("patientActionFrame"); if (f) f.src = "about:blank";
    currentAction = "";
    document.body.classList.remove("patient-action-open");
    clearContext();
  }
  function closeForm() {
    const fm=formModal(); if(fm) fm.hidden=true;
    const f=$("patientActionFrame"); if(f) f.src="about:blank";
    currentAction="";
    const m=modal(); if(m) m.hidden=false;
    renderActions();
    requestAnimationFrame(()=>$("patientActionBody")?.querySelector("[data-action]")?.focus());
  }
  function openAction(action) {
    if (!selectedTodayPatient) return;
    const url=formUrl(action); if(!url) return;
    currentAction=action;
    setContext(selectedTodayPatient, action);
    const m=modal(); if(m) m.hidden=true;
    const fm=formModal(), frame=$("patientActionFrame"); if(!fm||!frame)return;
    $("patientActionFormTitle").textContent = actionsFor(selectedTodayPatient).find(x=>x.key===action)?.label || "Patient Action";
    frame.src = `${url}?patientAction=1`;
    fm.hidden=false;
    requestAnimationFrame(()=>$("patientActionFormBack")?.focus());
  }
  async function doneToTodayList() {
    await refreshSelectedAfterMutation("DONE");
    const fm = formModal(); if (fm) fm.hidden = true;
    const f = $("patientActionFrame"); if (f) f.src = "about:blank";
    const m = modal(); if (m) m.hidden = true;
    currentAction = "";
    document.body.classList.remove("patient-action-open");
    clearContext();
    window.dispatchEvent(new CustomEvent("neuron:refresh-opd-today"));
  }

  async function refreshSelectedAfterMutation(message) {
    if (!selectedTodayPatient) return;
    try {
      const city=String(selectedTodayPatient.city||TodayCity.resolve()||"").trim();
      const date=(()=>{const p=U.parts();return `${p.y}${String(p.m).padStart(2,"0")}${String(p.d).padStart(2,"0")}`})();
      const record=await IDB.get("cache",`OPD_TODAY|${date}|${city}`).catch(()=>null);
      const next=(record?.patients||[]).find(x=>String(x.appointmentId||"")===String(selectedTodayPatient.appointmentId||""));
      if(next){ setContext(next,currentAction); $("patientActionTitle").textContent=next.name||"Patient"; $("patientActionAge").textContent=ageText(next); renderActions(); }
      window.dispatchEvent(new CustomEvent("neuron:patient-action-updated",{detail:{patient:next||selectedTodayPatient,action:currentAction,message}}));
    } catch (_) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.NeuronPatientAction = {get:()=>selectedTodayPatient,set:setContext,clear:clearContext,open:openPatient,refresh:refreshSelectedAfterMutation};
    $("patientActionClose")?.addEventListener("click", closePatient);
    $("patientActionBack")?.addEventListener("click", closePatient);
    $("patientActionBackdrop")?.addEventListener("click", closePatient);
    $("patientActionFormBack")?.addEventListener("click", closeForm);
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (!formModal()?.hidden) closeForm();
      else if (!modal()?.hidden) closePatient();
    });
    window.addEventListener("message", e => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === "NEURON_PATIENT_ACTION_MUTATION") {
        (async()=>{
          await refreshSelectedAfterMutation(e.data.action||currentAction);
          window.dispatchEvent(new CustomEvent("neuron:refresh-opd-today"));
        })();
        return;
      }
      if (e.data?.type === "NEURON_PATIENT_ACTION_DONE") {
        doneToTodayList();
      }
    });
  });
})();
