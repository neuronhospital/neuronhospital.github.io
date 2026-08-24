window.NeuronAPI={
 call:async(action,data={},timeout=25000)=>{
  const u=NEURON_CONFIG.apiUrl;
  if(!u||u.includes("PASTE_YOUR"))throw Error("Configure the Apps Script /exec URL in js/config.js.");
  if(!navigator.onLine)throw Error("You are offline. The request is retained locally where supported.");

  const controller=new AbortController();
  let timer=null;
  const run=async()=>{
    const r=await fetch(u,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({action,...data}),
      signal:controller.signal,
      cache:"no-store"
    });

    const text=await r.text();
    let j;
    try{j=JSON.parse(text||"{}");}
    catch(_){throw Error("Server returned an invalid response.");}

    if(!r.ok)throw Error(j.error||("Server request failed ("+r.status+")."));
    if(j.ok===false)throw Error(j.error||"Server request failed.");
    return j;
  };

  try{
    timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeout)||25000));
    return await run();
  }catch(e){
    if(e&&e.name==="AbortError")
      throw Error("Network timeout. The request may still have been recorded.");
    throw e;
  }finally{
    if(timer)clearTimeout(timer);
  }
 }
};
