// Client-side helper: real counterparty relationship check behind the
// NDA agent. Calls GET /api/intake/counterparty-check (which queries the
// shared Counterparty entity) and degrades gracefully to "not found" so
// the agent never breaks on a lookup failure or empty name. Replaces the
// hardcoded mockPriorNDACheck.
// Optional server-side resolver. The server agent worker injects a
// direct DB lookup (lookupCounterpartyRelationship) so the NDA agent gets
// the real relationship signal without a relative fetch (browser-only).
// Null in the browser → the fetch path runs.
let _resolver=null;
export function setCounterpartyResolver(fn){ _resolver=fn; }

export async function checkCounterpartyRelationship(name){
  const NONE={
    found:false,counterpartyId:null,counterpartyName:null,priorMatterCount:0,priorNda:null,
    note:"No existing relationship on file — draft from the standard template.",
  };
  if(!name||name.trim().length<2) return NONE;
  if(_resolver){
    try{ return {...NONE,...(await _resolver(name))}; }
    catch{ return NONE; }
  }
  try{
    const resp=await fetch(`/api/intake/counterparty-check?name=${encodeURIComponent(name)}`);
    if(!resp.ok) return NONE;
    const data=await resp.json();
    // Defensive: ensure the shape the agent expects.
    return {...NONE,...data};
  }catch{
    return NONE;
  }
}
