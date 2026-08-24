document.addEventListener("DOMContentLoaded",()=>{
 const g=$("gate"),p=$("portal"),KEY="neuron_secure_access";
 const showPortal=()=>{g.hidden=true;p.hidden=false;};
 if(localStorage.getItem(KEY)==="1"){
   showPortal();
   return;
 }
 $("enter").onclick=()=>{
   const btn=$("enter"); btn.disabled=true; btn.textContent="Verifying…";
   try{
     if($("password").value!=="265044")throw Error("Incorrect password.");
     localStorage.setItem(KEY,"1");
     showPortal();
   }catch(e){
     alert(e.message||"Unable to access portal.");
   }finally{
     btn.disabled=false; btn.textContent="Access Portal";
   }
 };
});