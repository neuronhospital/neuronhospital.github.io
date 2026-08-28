window.IDB={
 db:null,
 open(){if(this.db)return this.db;return this.db=new Promise((ok,no)=>{const r=indexedDB.open("NEURON_V2",3);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("followupCache"))d.createObjectStore("followupCache",{keyPath:"key"});if(!d.objectStoreNames.contains("tx")){const st=d.createObjectStore("tx",{keyPath:"id"});st.createIndex("status","status");st.createIndex("type","type")}if(!d.objectStoreNames.contains("cache"))d.createObjectStore("cache",{keyPath:"key"});if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta",{keyPath:"key"})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})},
 put(s,v){return this.open().then(d=>new Promise((ok,no)=>{const t=d.transaction(s,"readwrite");t.objectStore(s).put({...v,updatedAt:Date.now()});t.oncomplete=ok;t.onerror=()=>no(t.error)}))},
 get(s,k){return this.open().then(d=>new Promise((ok,no)=>{const r=d.transaction(s).objectStore(s).get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}))},
 all(s){return this.open().then(d=>new Promise((ok,no)=>{const r=d.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}))},
 pending(){return this.all("tx").then(a=>a.filter(x=>x.status==="pending"||x.status==="uncertain"))}
};