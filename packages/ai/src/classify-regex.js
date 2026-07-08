export function classifyIntakeRegex(text,dept){
  const t=(text||"").toLowerCase();
  if(!t||t.length<10) return null;
  if(/harass|discriminat|retaliation|misconduct|wrongful.{1,10}(termination|firing)/.test(t))
    return{cat:"Employment — Sensitive",priority:"Critical",team:"Employment Team + GC",sla:"4 hrs",slaHours:4,rule:"RULE-1",conf:98,risk:"Critical",note:"Auto-escalated to GC per policy",hrs:20,source:"regex"};
  if(/lawsuit|subpoena|summons|deposition|demand letter|cease.{0,3}and.{0,3}desist|served with|notice of (claim|dispute)|\blitigation\b/.test(t))
    return{cat:"Litigation — Non-Court",priority:"High",team:"Litigation Team",sla:"8 hrs",slaHours:8,rule:"RULE-9",conf:90,risk:"High",note:"Litigation intake — attorney review; confirm deadline + preservation",hrs:12,source:"regex"};
  if(/\bnda\b|\bcda\b|non.{0,3}disclosure|confidential.{0,3}disclosure|confidentiality/.test(t)&&!/breach|violated/.test(t))
    return{cat:"NDA — Standard",priority:"Low",team:"AI Auto-Draft",sla:"2 hrs",slaHours:2,rule:"RULE-0",conf:96,risk:"None",note:"Auto-draft from playbook template",hrs:0,source:"regex"};
  if(/(loan|debt|covenant|facility|credit agreement).*(m|b)(illion)?/i.test(t)||(/€\d+|\$\d+m|\$\d+b/i.test(t)&&/(loan|covenant|debt|financing)/.test(t)))
    return{cat:"Finance — Debt / Covenant",priority:"High",team:"Finance Legal + GC",sla:"8 hrs",slaHours:8,rule:"RULE-2",conf:93,risk:"High",note:"Board-level exposure — GC review required",hrs:10,source:"regex"};
  if(/patent|trademark|copyright|open.{0,3}source|oss|inventorship/.test(t))
    return{cat:"IP / Trademark / OSS",priority:"Medium",team:"IP Team — David Park",sla:"24 hrs",slaHours:24,rule:"RULE-3",conf:91,risk:"Low",note:"Routine IP clearance",hrs:3,source:"regex"};
  if(/\bgdpr\b|dpia|personal data|privacy|telemetry|imei|biometric/.test(t))
    return{cat:"Privacy — DPIA / GDPR",priority:"Medium",team:"Privacy Team",sla:"24 hrs",slaHours:24,rule:"RULE-6",conf:89,risk:"Medium",note:"DPIA may be required",hrs:5,source:"regex"};
  if(/sanction|ofac|iran|russia|north korea|embarg|denied party/.test(t))
    return{cat:"Compliance — Sanctions",priority:"Critical",team:"Compliance + GC",sla:"4 hrs",slaHours:4,rule:"RULE-8",conf:99,risk:"Critical",note:"Auto-hold pending screen",hrs:12,source:"regex"};
  if(/ai act|regulatory.{0,20}statement|client.{0,10}facing.{0,10}compliance|eu.{0,20}regulation/.test(t))
    return{cat:"Regulatory — EU",priority:"High",team:"EU Counsel + GC",sla:"12 hrs",slaHours:12,rule:"RULE-4",conf:88,risk:"High",note:"Client-facing requires GC sign-off",hrs:6,source:"regex"};
  if(/vendor|msa|supplier|procurement.*contract|saas|subscription/.test(t)&&/\$|€|£|\d{3,}k|\d+.?m/i.test(t))
    return{cat:"Vendor Contract",priority:"High",team:"Commercial Contracts — Maria Chen",sla:"24 hrs",slaHours:24,rule:"RULE-7",conf:87,risk:"Medium",note:"Size threshold triggers GDPR check",hrs:4,source:"regex"};
  if(/vendor.*(brazil|china|russia|india|mexico|indonesia|vietnam)|\bdd\b|due diligence/.test(t))
    return{cat:"Vendor DD",priority:"Medium",team:"Compliance Team",sla:"72 hrs",slaHours:72,rule:"RULE-5",conf:85,risk:"Medium",note:"Enhanced DD per jurisdiction policy",hrs:8,source:"regex"};
  return null;
}
