import { K } from "./keys";
import { storeGet, storeSet } from "./store";

// ── Agent log (audit trail) ──
export async function appendAgentLog(entry){
  const log=await storeGet(K.AGENT_LOG,[]);
  const next=[{ts:Date.now(),...entry},...log].slice(0,500); // cap to 500
  return storeSet(K.AGENT_LOG,next);
}
export async function loadAgentLog(){ return await storeGet(K.AGENT_LOG,[]); }
