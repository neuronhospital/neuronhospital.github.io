/* Compatibility shim: the shared account authentication UI is managed by js/auth.js. */
document.addEventListener("DOMContentLoaded",()=>{ if(!window.NeuronAuth) console.error("NEURON authentication module was not loaded."); });
