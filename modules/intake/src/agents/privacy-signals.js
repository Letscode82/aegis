// ── Privacy Assessment Agent — deterministic signal core ────────────
//
// (GC Suite Working Architecture, Agent 7.) The risk rating and the
// escalation decision are DETERMINISTIC code, not LLM output: data
// categories, transfer flags, novel-tech flags, and the gaps list are
// regex-detected with the matched text kept as the citation. Claude
// drafts the preliminary-assessment prose around these facts.
//
// Doc: risk = category × volume × transfer × novelty; HIGH never stays
// with the agent. Sensitive-category processing, cross-border
// transfers, or novel technology (AI/profiling) → senior counsel / DPO
// path, always.
//
// Pure — no DB, no network.

const CATEGORY_PATTERNS=[
  // Order = severity. First two are the always-escalate categories.
  {category:"sensitive",label:"Sensitive personal data",re:/health (?:data|records?|information)|medical (?:data|records?|history)|biometric|genetic|racial|ethnic|religio(?:n|us)|sexual orientation|political opinion|caste|trade union|disability|mental health|patient/i},
  {category:"children",label:"Children's data",re:/\bchild(?:ren)?(?:'s)?\b|\bminors?\b|under (?:13|16|18)|\bkids?\b|school student/i},
  {category:"employee",label:"Employee data",re:/employee (?:data|records?|information|monitoring)|\bhr data\b|payroll|workforce (?:data|analytics)|staff (?:data|records)|background check/i},
  {category:"personal",label:"Personal data (general)",re:/personal (?:data|information)|\bpii\b|customer (?:data|records|information)|user (?:data|profiles?)|email address|phone number|contact details|location data|browsing|device identifier/i},
];

/** Data-category taxonomy (doc: personal / sensitive / children's / employee). */
export function detectDataCategories(text){
  const t=String(text||"");
  const hits=[];
  for(const c of CATEGORY_PATTERNS){
    const m=t.match(c.re);
    if(m) hits.push({category:c.category,label:c.label,matched:m[0]});
  }
  return hits;
}

/** Cross-border transfer signals. */
export function detectTransfer(text){
  const m=String(text||"").match(/cross.?border|transfer(?:red|ring)?\s.{0,30}(?:outside|abroad|overseas|to (?:the )?(?:us|usa|eu|uk|india|singapore|china|japan))|offshore|global (?:access|team|rollout)|hosted (?:in|on servers in)|data cent(?:er|re) in|international transfer/i);
  return m?{flag:true,matched:m[0]}:{flag:false,matched:null};
}

/** Novel technology signals (doc: AI/profiling → always escalate). */
export function detectNovelTech(text){
  const m=String(text||"").match(/\bai\b|artificial intelligence|machine learning|\bml model|profiling|automated decision|facial recognition|emotion (?:detection|recognition)|behaviou?ral (?:advertising|tracking)|scoring model|\bllm\b|generative/i);
  return m?{flag:true,matched:m[0]}:{flag:false,matched:null};
}

/** Volume signals — large-scale processing raises the rating. */
export function detectHighVolume(text){
  const m=String(text||"").match(/large.?scale|all (?:customers|employees|users)|entire (?:customer|user|employee) base|millions? of|\b\d{3,}[,.]?\d*k? (?:users|customers|employees|records|subjects)|nationwide|company.?wide/i);
  return m?{flag:true,matched:m[0]}:{flag:false,matched:null};
}

/**
 * Configured regime triggers (doc: e.g. DPDP Act, GDPR). Jurisdiction
 * keywords select which regimes clearly apply; when nothing matches,
 * both configured regimes are listed as "verify applicability".
 */
export function regimeTriggers(text){
  const t=String(text||"").toLowerCase();
  const regimes=[];
  if(/india|dpdp|bengaluru|mumbai|delhi|hyderabad|chennai|indian/.test(t))
    regimes.push({regime:"DPDP Act 2023 (India)",certain:true});
  if(/\bgdpr\b|europe|\beu\b|germany|france|netherlands|ireland|spain|italy|\buk\b|united kingdom|eea/.test(t))
    regimes.push({regime:"GDPR / UK GDPR",certain:true});
  if(/california|ccpa|cpra|united states|\bus customers\b/.test(t))
    regimes.push({regime:"CCPA/CPRA (California)",certain:true});
  if(regimes.length===0){
    regimes.push({regime:"DPDP Act 2023 (India)",certain:false},{regime:"GDPR / UK GDPR",certain:false});
  }
  return regimes;
}

/**
 * The gaps list — doc: "critically — what the requester's description
 * did NOT cover." Deterministic absence checks; each gap is a question
 * the approver sends back before relying on the assessment.
 */
export function gapsList(text){
  const t=String(text||"").toLowerCase();
  const gaps=[];
  if(!/\d+[,.]?\d*\s*k?\s*(?:users|customers|employees|records|subjects)|all (?:customers|employees|users)|large.?scale|volume/.test(t))
    gaps.push("Volume / scale of data subjects not stated.");
  if(!/reten(?:tion|d)|how long|delete(?:d|s)? after|days?|months?|years?/.test(t))
    gaps.push("Retention period not stated.");
  if(!/india|europe|\beu\b|\buk\b|\bus\b|united states|jurisdiction|located in|based in|residents/.test(t))
    gaps.push("Data-subject jurisdictions not stated — regime triggers unverified.");
  if(!/encrypt|access control|security|pseudonymi|anonymi|\bsso\b|mfa/.test(t))
    gaps.push("Security measures not described.");
  if(!/processor|sub.?processor|vendor|third.?part|hosted|cloud|saas|on.?prem/.test(t))
    gaps.push("Processors / sub-processors not identified.");
  if(!/consent|contract|legitimate interest|legal obligation|lawful basis/.test(t))
    gaps.push("Lawful-basis candidate not stated.");
  return gaps;
}

/**
 * Deterministic rating + escalation (doc: risk = category × volume ×
 * transfer × novelty; sensitive / children / cross-border / novel tech
 * escalate ALWAYS; HIGH never stays with the agent).
 */
export function assessPrivacyRisk({categories,transfer,novelTech,highVolume}){
  const cats=new Set(categories.map(c=>c.category));
  const reasons=[];
  if(cats.has("sensitive")) reasons.push("Sensitive-category processing — senior counsel / DPO path, always.");
  if(cats.has("children")) reasons.push("Children's data — senior counsel / DPO path, always.");
  if(transfer.flag) reasons.push("Cross-border transfer — senior counsel / DPO path, always.");
  if(novelTech.flag) reasons.push("Novel technology (AI/profiling) — senior counsel / DPO path, always.");

  let rating="LOW";
  if(cats.has("sensitive")||cats.has("children")) rating="HIGH";
  else if(transfer.flag||novelTech.flag) rating=highVolume.flag?"HIGH":"MEDIUM";
  else if(highVolume.flag||cats.has("employee")) rating="MEDIUM";

  return {rating,mustEscalate:reasons.length>0,escalationReasons:reasons};
}
