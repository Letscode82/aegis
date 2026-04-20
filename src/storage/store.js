// Async key/value store wrapper. Uses window.storage if present
// (installed by polyfill.js in main.jsx), otherwise falls back to
// an in-memory object. Values are JSON-encoded on write.

const __memStore={};
const hasWinStorage=()=>typeof window!=="undefined"&&window.storage&&typeof window.storage.get==="function";

export async function storeGet(key,def=null){
  try{
    if(hasWinStorage()){
      const r=await window.storage.get(key);
      if(r&&r.value) return JSON.parse(r.value);
    } else if(__memStore[key]){
      return JSON.parse(__memStore[key]);
    }
  }catch(e){/* first read */}
  return def;
}
export async function storeSet(key,value){
  try{
    const payload=JSON.stringify(value);
    if(hasWinStorage()) await window.storage.set(key,payload);
    else __memStore[key]=payload;
    return true;
  }catch(e){ console.error("store write failed",key,e); return false; }
}
export async function storeDel(key){
  try{ if(hasWinStorage()) await window.storage.delete(key); else delete __memStore[key]; }
  catch(e){ /* swallow */ }
}
