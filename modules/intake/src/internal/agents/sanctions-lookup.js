// Client-side helper: real sanctions screening behind the Vendor Intake
// agent. Calls GET /api/intake/sanctions-check and degrades safely — any
// failure or empty name returns status "unavailable" (NEVER "clear"), so
// the agent flags for review rather than producing a false all-clear.
// Replaces the hardcoded mockSanctionsCheck.
// Optional server-side resolver. The server agent worker injects a
// direct screen (screenAgainstSanctions) so the Vendor agent gets a real
// result without a relative fetch (browser-only). Null in the browser →
// the fetch path runs.
let _resolver=null;
export function setSanctionsResolver(fn){ _resolver=fn; }

export async function screenSanctions(name, country){
  const UNAVAILABLE={
    status:"unavailable",
    flags:["Screening service unreachable."],
    matches:[],
    listAsOf:null,
    note:"Automated sanctions screening is unavailable — manual screening required before onboarding.",
  };
  if(_resolver){
    try{ const d=await _resolver(name,country); return d&&d.status?d:UNAVAILABLE; }
    catch{ return UNAVAILABLE; }
  }
  try{
    const qs=new URLSearchParams();
    if(name) qs.set("name",name);
    if(country) qs.set("country",country);
    const resp=await fetch(`/api/intake/sanctions-check?${qs.toString()}`);
    if(!resp.ok) return UNAVAILABLE;
    const data=await resp.json();
    if(!data||!data.status) return UNAVAILABLE;
    return data;
  }catch{
    return UNAVAILABLE;
  }
}
