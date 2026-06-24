// Client-side helper: real sanctions screening behind the Vendor Intake
// agent. Calls GET /api/intake/sanctions-check and degrades safely — any
// failure or empty name returns status "unavailable" (NEVER "clear"), so
// the agent flags for review rather than producing a false all-clear.
// Replaces the hardcoded mockSanctionsCheck.
export async function screenSanctions(name, country){
  const UNAVAILABLE={
    status:"unavailable",
    flags:["Screening service unreachable."],
    matches:[],
    listAsOf:null,
    note:"Automated sanctions screening is unavailable — manual screening required before onboarding.",
  };
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
