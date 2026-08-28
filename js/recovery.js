async function recoverPendingBookings_(){
 if(!navigator.onLine)return;
 const items=await IDB.pending().catch(()=>[]);
 for(const x of items){
  try{
   let r=null;
   if(x.type==="OPD_BOOKING")r=await NeuronAPI.call("checkBookingRequest",{bookingRequestId:x.id,city:x.payload.city},10000);
   if(x.type==="EEG_BOOKING")r=await NeuronAPI.call("checkEEGBookingRequest",{eegBookingRequestId:x.id,city:x.payload.city},10000);
   if(r&&r.found)await IDB.put("tx",{...x,status:"complete",result:r,recoveredAt:Date.now()});
  }catch(_){}
 }
});

window.addEventListener("online",()=>{
  recoverPendingBookings_().catch(()=>{});
});

document.addEventListener("DOMContentLoaded",()=>{
  recoverPendingBookings_().catch(()=>{});
});
