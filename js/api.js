window.NeuronAPI={
 call:async(action,data={},timeout=25000)=>{
  const u=NEURON_CONFIG.apiUrl;
  if(!u||u.includes("PASTE_YOUR"))throw Error("Configure the Apps Script /exec URL in js/config.js.");
  if(!navigator.onLine)throw Error("You are offline. The request is retained locally where supported.");
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{
   const r=await fetch(u,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...data}),signal:c.signal,cache:"no-store"});
   const j=await r.json();if(j.ok===false)throw Error(j.error||"Server request failed.");return j;
  }catch(e){if(e.name==="AbortError")throw Error("Network timeout. The request may still have been recorded.");throw e}
  finally{clearTimeout(t)}
 }
};