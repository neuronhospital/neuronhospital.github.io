window.NeuronAPI={
 call:async(action,data={},timeout=25000)=>{
  const u=NEURON_CONFIG.apiUrl;
  if(!u||u.includes("PASTE_YOUR"))throw Error("Configure the Apps Script /exec URL in js/config.js.");
  if(!navigator.onLine)throw Error("You are offline. The request is retained locally where supported.");

  const ms=Math.max(1000,Number(timeout)||25000);
  const controller=new AbortController();
  let abortTimer=null;
  let timeoutTimer=null;

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

  const hardTimeout=new Promise((_,reject)=>{
    timeoutTimer=setTimeout(()=>{
      try{controller.abort();}catch(_){}
      reject(Error("Network timeout. The request may still have been recorded."));
    },ms);
  });

  try{
    return await Promise.race([run(),hardTimeout]);
  }catch(e){
    if(e&&e.name==="AbortError")
      throw Error("Network timeout. The request may still have been recorded.");
    throw e;
  }finally{
    if(abortTimer)clearTimeout(abortTimer);
    if(timeoutTimer)clearTimeout(timeoutTimer);
  }
 },
 verifyBooking:async(type,id,city,retries=3)=>{
  const action=type==="EEG"?"checkEEGBookingRequest":"checkBookingRequest";
  const key=type==="EEG"?"eegBookingRequestId":"bookingRequestId";
  for(let i=0;i<retries;i++){
    try{
      const r=await NeuronAPI.call(action,{[key]:id,city},10000);
      if(r&&r.found)return r;
    }catch(_){}
    if(i<retries-1)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  return null;
 }
};
