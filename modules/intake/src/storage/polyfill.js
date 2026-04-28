// localStorage-backed polyfill for the window.storage API used by the
// AEGIS monolith (a Claude artifact environment). Installing this before
// any storage consumer loads keeps storeGet/storeSet/storeDel working
// verbatim against the browser's persistent localStorage.
//
// API shape (from the artifact runtime):
//   window.storage.get(key)    → Promise<{value: string} | null>
//   window.storage.set(key,str)→ Promise<void>
//   window.storage.delete(key) → Promise<void>
//
// Values are always stringified JSON — callers parse on read.

export function installStoragePolyfill(){
  if(typeof window==="undefined") return;
  if(window.storage&&typeof window.storage.get==="function") return;
  const ls=(typeof localStorage!=="undefined")?localStorage:null;
  window.storage={
    async get(key){
      if(!ls) return null;
      const v=ls.getItem(key);
      return v==null?null:{value:v};
    },
    async set(key,value){
      if(!ls) return;
      ls.setItem(key,value);
    },
    async delete(key){
      if(!ls) return;
      ls.removeItem(key);
    },
  };
}
