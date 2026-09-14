(function(){
  var path=(location.pathname||"").toLowerCase();
  var key="neuron_secure_access";
  if(path.indexOf("eeg_calls_booking")!==-1) key="neuron_eeg_calls_access";
  else if(path.indexOf("eeg_calls_update_stats")!==-1) key="neuron_eeg_calls_access";
  try{
    if(localStorage.getItem(key)==="1") document.documentElement.classList.add("neuron-secure-preauthorized");
  }catch(e){}
})();
