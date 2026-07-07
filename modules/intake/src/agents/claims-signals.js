// ── Marketing-Material Review Agent — deterministic claim core ──────
//
// (GC Suite Working Architecture, Agent 8.) Claim taxonomy is
// DETERMINISTIC: regulated product / therapeutic claims → mandatory
// human review, no exceptions; unsubstantiated superlatives and
// absolute promises are flagged with the matched text cited;
// HCP- / conference-facing material always escalates. Claude tags the
// copy and suggests compliant wording around these facts.
//
// The approved-claims library below is the seeded starting set — the
// governed, product/market-scoped library is the Phase C ontology
// surface ("USES_CLAIM edges"); entries here follow the same shape.

export const APPROVED_CLAIMS=[
  {id:"CL-001",text:"trusted by leading enterprises",market:"GLOBAL",substantiation:"Customer roster on file (2026 review)",expires:"2027-01-31"},
  {id:"CL-002",text:"iso 27001 certified",market:"GLOBAL",substantiation:"Certificate #IS-88231, valid to 2027-06",expires:"2027-06-30"},
  {id:"CL-003",text:"24/7 customer support",market:"GLOBAL",substantiation:"Support SLA doc v3",expires:"2026-12-31"},
];

const REGULATED_RE=/\bcures?\b|\btreats?\b|\bprevents?\b|\bheals?\b|clinically (?:proven|tested)|fda[- ]approved|therapeutic|diagnos(?:es|is|tic)|medical(?:ly)? (?:benefit|proven)|kills? \d+(?:\.\d+)?% of (?:germs|bacteria|viruses)|reduces? (?:cholesterol|blood pressure|anxiety)|safe for (?:children|kids|infants)|drug|prescription/i;
const SUPERLATIVE_RE=/\bbest\b|#\s?1|number one|\bfastest\b|\bsafest\b|\bleading\b|most (?:effective|trusted|advanced)|award[- ]winning|world[- ]class|\bonly\b.{0,20}(?:solution|product|platform)/i;
const ABSOLUTE_RE=/guarantee[ds]?|risk[- ]free|no side effects|zero (?:risk|defects|downtime)|100% (?:safe|effective|secure|accurate)|never fails/i;
const HCP_RE=/\bhcps?\b|healthcare professional|physician|doctor[- ]facing|medical congress|conference (?:booth|material|handout)|continuing medical education|\bcme\b/i;
const COMPARATIVE_RE=/(?:better|faster|cheaper|stronger|safer) than (?:[A-Z][\w]*|our competitors?|the competition|any other)|outperforms?|beats?\s+(?:[A-Z][\w]*|the competition)/i;

/**
 * Deterministic claim-signal scan. Every hit carries the matched text
 * as its citation. Regulated hits force full human review; HCP hits
 * force escalation; superlatives/absolutes/comparatives need
 * substantiation review.
 */
export function scanClaims(text){
  const t=String(text||"");
  const signals=[];
  const scan=(re,kind,label)=>{
    const m=t.match(re);
    if(m) signals.push({kind,label,matched:m[0]});
  };
  scan(REGULATED_RE,"regulated","Regulated product / therapeutic claim");
  scan(HCP_RE,"hcp","HCP- / conference-facing material");
  scan(SUPERLATIVE_RE,"superlative","Superlative claim (substantiation required)");
  scan(ABSOLUTE_RE,"absolute","Absolute promise (substantiation required)");
  scan(COMPARATIVE_RE,"comparative","Comparative claim (head-to-head substantiation required)");
  return signals;
}

/** Library-verbatim matches in the copy (fast-track candidates). */
export function matchLibraryClaims(text){
  const t=String(text||"").toLowerCase();
  return APPROVED_CLAIMS.filter(c=>t.includes(c.text));
}

/**
 * Route per the doc taxonomy:
 *   regulated or HCP-facing         → full-review  (escalate — never cleared by the agent)
 *   any other claim signal          → revise       (flag-for-review with suggested wording)
 *   no claim signals detected       → fast-track   (still human-approved; the agent only ranks it)
 */
export function routeMarketingReview(signals){
  if(signals.some(s=>s.kind==="regulated"||s.kind==="hcp"))
    return {route:"full-review",action:"escalate"};
  if(signals.length>0)
    return {route:"revise",action:"flag-for-review"};
  return {route:"fast-track",action:"flag-for-review"};
}
