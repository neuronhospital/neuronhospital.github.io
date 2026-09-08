async function sha256(message){
 const data=new TextEncoder().encode(message);
 const hash=await crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(hash))
   .map(b=>b.toString(16).padStart(2,'0'))
   .join('');
}

document.addEventListener("DOMContentLoaded",()=>{
 const g=$("gate"),p=$("portal")||$("edit")||$("content");
 const KEY="neuron_secure_access";
 const PASSWORD_HASH="842f3a019b7f38f357d9e28a483bc9c6077c596994dafb91c0b6fa61ef1caee9";

 const showPortal=()=>{
   if(g) g.hidden=true;
   if(p) p.hidden=false;
 };

 if(localStorage.getItem(KEY)==="1"){
   showPortal();
   return;
 }

 const btn=$("enter");
 if(!btn) return;

 btn.onclick=async()=>{
   btn.disabled=true;
   btn.textContent="Verifying…";
   try{
     const enteredHash=await sha256($("password").value);
     if(enteredHash!==PASSWORD_HASH) throw Error("Incorrect password.");
     localStorage.setItem(KEY,"1");
     showPortal();
   }catch(e){
     alert(e.message||"Unable to access portal.");
   }finally{
     btn.disabled=false;
     btn.textContent="Access Portal";
   }
 };
});
