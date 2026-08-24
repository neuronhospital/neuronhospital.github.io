document.addEventListener("DOMContentLoaded",()=>{
 const g=$("gate"),p=$("portal"),KEY="neuron_secure_until",TOKEN="neuron_retrieval_token";
 const HOURS=6,TTL=HOURS*3600000;
 const renew=()=>{
   localStorage.setItem(KEY,String(Date.now()+TTL));
 };
 const showGate=(message)=>{
   localStorage.removeItem(KEY);
   localStorage.removeItem(TOKEN);
   g.hidden=false;
   p.hidden=true;
   if($("password")){$("password").value="";$("password").focus();}
   if(message)alert(message);
 };
 window.NeuronSecureSession={renew,expire:()=>showGate("Session expired. Please enter the password again.")};
 window.addEventListener("storage",e=>{if(e.key===KEY){if(Number(e.newValue||0)>Date.now() && localStorage.getItem(TOKEN)){if(g.hidden===false)showPortal();}else if(g.hidden===true){showGate();}}});
 const showPortal=()=>{g.hidden=true;p.hidden=false;renew();};
 if(Number(localStorage.getItem(KEY)||0)>Date.now() && localStorage.getItem(TOKEN)){
   showPortal();
   return;
 }
 $("enter").onclick=async()=>{
   const btn=$("enter"); btn.disabled=true; btn.textContent="Verifying…";
   try{
     const r=await NeuronAPI.call("retrievalLogin",{password:$("password").value},15000);
     if(!r||!r.token)throw Error("Unable to create secure session.");
     localStorage.setItem(TOKEN,r.token);
     showPortal();
   }catch(e){
     alert(e.message||"Unable to access the portal.");
   }finally{
     btn.disabled=false; btn.textContent="Access Portal";
   }
 };
});