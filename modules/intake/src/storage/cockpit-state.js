import { K } from "./keys";
import { storeGet, storeSet } from "./store";

// ── Cockpit state ──
// `attorney` is null at fresh load; the Cockpit UI resolves the display
// name from the Auth0 session (useCurrentUser). The field is kept for
// per-user persisted overrides (e.g. a display alias) and stays null
// for users who never set one. Phase 1a kills the hardcoded
// "You (Alex Nguyen)" demo string that lived here.
export const DEFAULT_COCKPIT_STATE={lastPos:0,attorney:null,triagedToday:0,triagedDate:null};

// Legacy demo string that pre-Phase-1a clients persisted to
// `UserPreference`. On load we treat it as null so existing users
// transparently migrate to session-resolved attribution without
// having to reset their cockpit state.
const LEGACY_DEFAULT_ATTORNEY="You (Alex Nguyen)";

export async function loadCockpitState(){
  let s=await storeGet(K.COCKPIT_STATE,DEFAULT_COCKPIT_STATE);
  // Sunset the legacy hardcoded attorney string. Consumers fall back
  // to the session user via useCurrentUser() when attorney is null.
  if(s.attorney===LEGACY_DEFAULT_ATTORNEY) s={...s,attorney:null};
  // reset daily counter
  const today=new Date().toISOString().slice(0,10);
  if(s.triagedDate!==today) return {...s,triagedToday:0,triagedDate:today};
  return s;
}
export async function saveCockpitState(state){ return storeSet(K.COCKPIT_STATE,state); }
