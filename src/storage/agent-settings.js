import { K } from "./keys";
import { storeGet, storeSet } from "./store";

// ── Agent settings ──
export const DEFAULT_AGENT_SETTINGS={
  "nda-agent":{enabled:true},
  "faq-agent":{enabled:true},
  "vendor-intake-agent":{enabled:true},
  "contract-review-agent":{enabled:true},
  "trademark-agent":{enabled:true},
  "policy-qa-agent":{enabled:true},
};
export async function loadAgentSettings(){
  const s=await storeGet(K.AGENT_SETTINGS,null);
  if(!s) return DEFAULT_AGENT_SETTINGS;
  // merge so newly added agents default to enabled
  return {...DEFAULT_AGENT_SETTINGS,...s};
}
export async function saveAgentSettings(settings){ return storeSet(K.AGENT_SETTINGS,settings); }
