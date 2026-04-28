import { K } from "./keys";
import { storeGet, storeSet } from "./store";

// ── Cockpit state ──
export const DEFAULT_COCKPIT_STATE={lastPos:0,attorney:"You (Alex Nguyen)",triagedToday:0,triagedDate:null};
export async function loadCockpitState(){
  const s=await storeGet(K.COCKPIT_STATE,DEFAULT_COCKPIT_STATE);
  // reset daily counter
  const today=new Date().toISOString().slice(0,10);
  if(s.triagedDate!==today) return {...s,triagedToday:0,triagedDate:today};
  return s;
}
export async function saveCockpitState(state){ return storeSet(K.COCKPIT_STATE,state); }
