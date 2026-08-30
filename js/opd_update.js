document.addEventListener("DOMContentLoaded",()=>{
  let selected=null;
  const $=U.$;
  $("city").innerHTML=NEURON_CONFIG.cities.map(x=>`<option>${x}</option>`).join("");

  function clearLoadedState(){
    selected=null;
    $("patients").innerHTML="";
    $("edit").hidden=true;
    $("confirmation").hidden=true;
    $("confirmation").innerHTML="";
    $("status").textContent="";
  }

  function paymentMode(x){
    const cash=Number(x?.opdCashPaid)||0, online=Number(x?.opdOnlinePaid)||0;
    if(cash>0&&online>0)return "Split";
    if(online>0)return "Online";
    return "Cash";
  }

  function updateSplitTotal(){
    $("opdTotalPaid").textContent=U.money((Number($("cash").value)||0)+(Number($("online").value)||0));
  }

  function renderPayment(x){
    const mode=paymentMode(x), cash=Number(x?.opdCashPaid)||0, online=Number(x?.opdOnlinePaid)||0;
    if(mode==="Split"){
      $("opdSingle").hidden=true;
      $("opdSplit").hidden=false;
      $("cashLabel").textContent="Paid in Cash";
      $("onlineLabel").textContent="Paid Online";
      $("cash").value=cash;
      $("online").value=online;
      updateSplitTotal();
    }else{
      $("opdSplit").hidden=true;
      $("opdSingle").hidden=false;
      $("chargeLabel").textContent=mode==="Online"?"OPD Charges Paid Online":"OPD Charges Paid in Cash";
      $("charge").value=mode==="Online"?online:cash;
    }
  }

  function renderChangedValues(before,after){
    const rows=[];
    const esc=v=>U.esc(String(v??"").trim()||"—");
    const add=(label,a,b)=>{if(String(a??"").trim()!==String(b??"").trim())rows.push(`<div class="confirm-row"><span>${label}</span><b>${esc(a)} → ${esc(b)}</b></div>`)};
    add("Patient Name",before?.name,after?.name);
    add("Age",`${before?.age??""} ${before?.ageUnit||""}`.trim(),`${after?.age??""} ${after?.ageUnit||""}`.trim());
    add("Address",before?.address,after?.address);
    add("Referred By Dr./Hospital",before?.referredBy,after?.referredBy);
    add("WhatsApp Number",before?.whatsapp,after?.whatsapp);
    const beforePay=`Cash ${U.money(before?.opdCashPaid||0)} + Online ${U.money(before?.opdOnlinePaid||0)}`;
    const afterPay=`Cash ${U.money(after?.opdCashPaid||0)} + Online ${U.money(after?.opdOnlinePaid||0)}`;
    add("OPD Charges Paid",beforePay,afterPay);
    return rows.length?rows.join(""):"<p>No values changed.</p>";
  }

  $("city").addEventListener("change",()=>{
    clearLoadedState();
  });

  $("load").onclick=async()=>{
    if($("load").disabled)return;
    clearLoadedState();
    $("load").disabled=true;
    $("load").textContent="Loading...";
    $("load").className="btn btn-primary";
    $("loadMessage").hidden=false;
    try{
      const r=await NeuronAPI.call("getFollowupPatientsByWhatsApp",{whatsapp:U.phone($("wa").value),city:$("city").value});
      r.patients.forEach(x=>{
        const b=document.createElement("button");
        b.className="patient-option";
        b.innerHTML=`<b>${U.esc(x.name)}</b><small>${x.age} ${U.esc(x.ageUnit)} • ${U.date(x.date)}</small>`;
        b.onclick=()=>{
          selected=x;
          $("confirmation").hidden=true;
          $("confirmation").innerHTML="";
          document.querySelectorAll(".patient-option").forEach(z=>z.classList.remove("selected"));
          b.classList.add("selected");
          $("edit").hidden=false;
          $("name").value=x.name||"";
          $("age").value=x.age??"";
          $("unit").value=x.ageUnit||"years";
          $("address").value=x.address||"";
          $("ref").value=x.referredBy||"";
          $("editWa").value=x.whatsapp||"";
          renderPayment(x);
        };
        $("patients").appendChild(b);
        if(r.patients.length===1)b.click();
      });
    }catch(e){
      $("status").textContent=e.message;
    }finally{
      $("load").disabled=false;
      $("load").textContent="Load";
      $("load").className="btn btn-secondary";
      $("loadMessage").hidden=true;
    }
  };

  $("cash").oninput=updateSplitTotal;
  $("online").oninput=updateSplitTotal;

  $("save").onclick=async()=>{
    if(!selected||$("save").disabled)return;
    const id=U.uuid("upd"),mode=paymentMode(selected);
    let cash=0,online=0;
    if(mode==="Split"){
      cash=Number($("cash").value)||0;
      online=Number($("online").value)||0;
    }else if(mode==="Online") online=Number($("charge").value)||0;
    else cash=Number($("charge").value)||0;
    const p={
      updateRequestId:id,
      appointmentId:selected.appointmentId,
      city:selected.city,
      whatsapp:selected.whatsapp,
      whatsappNew:U.phone($("editWa").value),
      name:U.title($("name").value),
      age:Number($("age").value),
      ageUnit:$("unit").value,
      address:U.title($("address").value),
      referredBy:U.title($("ref").value),
      nextFollowupCity:selected.nextFollowupCity||"",
      opdCharges:cash+online,
      opdPaymentMode:mode,
      opdCashPaid:cash,
      opdOnlinePaid:online
    };
    await IDB.put("tx",{id,type:"OPD_UPDATE",status:"pending",payload:p});
    $("save").disabled=true;
    $("save").textContent="Updating...";
    $("save").className="btn btn-primary";
    $("updateMessage").hidden=false;
    try{
      const r=await NeuronAPI.call("updateOPDDetails",p,25000);
      await IDB.put("tx",{id,type:"OPD_UPDATE",status:"complete",payload:p,result:r});
      $("confirmation").hidden=false;
      $("confirmation").innerHTML=`<div class="success"><div class="success-icon">✓</div><h2>OPD Details Updated</h2><p>Appointment ID: <b>${U.esc(r.appointmentId)}</b></p><h3>Changed and Updated Values</h3>${renderChangedValues(r.before,r.after)}</div>`;
    }catch(e){
      await IDB.put("tx",{id,type:"OPD_UPDATE",status:"uncertain",payload:p});
      alert("Update status is uncertain. Do not repeat it until the original request is checked.");
    }finally{
      $("save").disabled=false;
      $("save").textContent="Update OPD Details";
      $("save").className="cta";
      $("updateMessage").hidden=true;
    }
  };
});
