document.addEventListener("DOMContentLoaded",()=>{
 const g=$("gate"),p=$("portal"),KEY="neuron_secure_until",TOKEN="neuron_retrieval_token";
 const showPortal=()=>{g.hidden=true;p.hidden=false;};
 if(Number(localStorage.getItem(KEY)||0)>Date.now()){
   showPortal();
   return;
 }
 $("enter").onclick=async()=>{
   const btn=$("enter"); btn.disabled=true; btn.textContent="Verifying…";
   try{
     if($("password").value!=="265044")throw Error("Incorrect password.");
     // Obtain the same backend retrieval session during the single password entry.
     // The Statistics page will reuse this token instead of asking for the
     // password again when Retrieve Records is clicked.
     const r=await NeuronAPI.call("retrievalLogin",{password:$("password").value},15000);
     if(!r||!r.token)throw Error("Unable to create retrieval session.");
     localStorage.setItem(TOKEN,r.token);
     localStorage.setItem(KEY,String(Date.now()+NEURON_CONFIG.secureCacheHours*3600000));
     showPortal();
   }catch(e){
     alert(e.message||"Unable to access Statistics.");
   }finally{
     btn.disabled=false; btn.textContent="Access Portal";
   }
 };
});