// ── oKF-3: code corpora → KnowledgeItems ─────────────────────────────
//
// The 9 code-corpus agents kept their knowledge in .js modules
// (kb.js, policy-library.js, …). oKF-3 migrates that knowledge into oKF
// KnowledgeItems so it becomes editable in the Agent Designer's Knowledge
// tab. Where a corpus is a DATA array (KB, policy, claims, contract-type
// catalog) we import it directly — one source of truth, the array is the
// seed input. Where a corpus is a RULE ENGINE (notice dates, privacy
// triage, trademark, litigation, sanctions) the *computation* stays in
// code; here we capture the taxonomy / thresholds it applies as editable
// RULE items so the prompt-facing knowledge is configurable.
import { AGENT_KB } from "../kb";
import { POLICY_LIBRARY } from "../policy-library";
import { APPROVED_CLAIMS } from "../claims-signals";
import { CONTRACT_PLAYBOOKS } from "../contract-playbooks";

const pad = (n) => String(n).padStart(3, "0");

// ── Data-array corpora (imported → items) ────────────────────────────

export function approvedKbPack() {
  return {
    key: "approved-kb",
    name: "Approved knowledge base",
    kind: "APPROVED_KB",
    description: "Curated Q&A the FAQ agent answers from. Each entry cites its playbook source.",
    items: AGENT_KB.map((e, i) => ({
      code: `QA.KB.${pad(i + 1)}`,
      kind: "QA",
      title: e.q,
      bodyMarkdown: e.answer,
      data: { source: e.source || null },
      cohortTags: [],
      sortOrder: i,
    })),
    cohorts: [],
  };
}

export function policyCorpusPack() {
  return {
    key: "policy-corpus",
    name: "Policy corpus",
    kind: "POLICY_CORPUS",
    description: "Internal policies the Policy Q&A agent cites. Single-current-version by design.",
    items: POLICY_LIBRARY.map((e, i) => ({
      code: `QA.POL.${pad(i + 1)}`,
      kind: "QA",
      title: e.policy,
      bodyMarkdown: e.answer,
      data: { policy: e.policy },
      cohortTags: [],
      sortOrder: i,
    })),
    cohorts: [],
  };
}

export function claimsLibraryPack() {
  const approved = APPROVED_CLAIMS.map((c, i) => ({
    code: `CLAIM.${c.id}`,
    kind: "REFERENCE",
    title: c.text,
    bodyMarkdown: `Pre-cleared claim. Substantiation: ${c.substantiation}. Market: ${c.market}. Expires ${c.expires}.`,
    data: { market: c.market, substantiation: c.substantiation, expires: c.expires },
    cohortTags: [],
    sortOrder: i,
  }));
  const rules = [
    ["RULE.CLAIMS.REGULATED", "Regulated / health claims force full review", "Any cure/treat/prevent/clinically-proven/FDA-approved language is a regulated claim — always route to full human review, never fast-track."],
    ["RULE.CLAIMS.HCP", "HCP-facing material escalates", "Content aimed at healthcare professionals (physician-facing, congress/booth, CME) escalates regardless of claim content."],
    ["RULE.CLAIMS.SUPERLATIVE", "Superlatives need substantiation", "'Best', '#1', 'fastest', 'leading', 'award-winning' require on-file substantiation before use."],
    ["RULE.CLAIMS.ABSOLUTE", "Absolute claims need proof", "'Guarantee', 'risk-free', '100% safe/effective', 'never fails' require documented proof; otherwise strike."],
    ["RULE.CLAIMS.COMPARATIVE", "Comparative claims need a basis", "'Better/faster than X', 'outperforms', 'beats the competition' need a substantiation basis and a market check."],
  ].map(([code, title, body], i) => ({ code, kind: "RULE", title, bodyMarkdown: body, data: {}, cohortTags: [], sortOrder: 100 + i }));
  return { key: "claims-library", name: "Approved-claims library", kind: "CLAIMS_LIBRARY", description: "Pre-cleared claims + the substantiation rules the Marketing Review agent applies.", items: [...approved, ...rules], cohorts: [] };
}

/** Contract-type catalog → one item per playbook, each in its own cohort
 *  (generalizes the Specialist's per-type playbook selection). */
export function contractTypeCatalogPack() {
  const items = CONTRACT_PLAYBOOKS.map((pb, i) => {
    const parts = [];
    if (pb.mandatory?.length) parts.push(`Mandatory:\n- ${pb.mandatory.join("\n- ")}`);
    if (pb.forbidden?.length) parts.push(`Forbidden:\n- ${pb.forbidden.join("\n- ")}`);
    if (pb.negotiable?.length) parts.push(`Negotiable:\n- ${pb.negotiable.join("\n- ")}`);
    if (pb.escalation?.always) parts.push(`Escalation: ${pb.escalation.always}`);
    return {
      code: `PB.${pb.id.replace(/^PB-/, "")}`,
      kind: "CLAUSE",
      title: `${pb.label} (${pb.version})`,
      bodyMarkdown: parts.join("\n\n"),
      data: { owner: pb.owner || null, reviewedAt: pb.reviewedAt || null },
      cohortTags: [`type:${pb.id}`],
      sortOrder: i,
    };
  });
  const cohorts = CONTRACT_PLAYBOOKS.map((pb, i) => ({
    key: pb.id,
    name: pb.label,
    tag: `type:${pb.id}`,
    // Selector derives match terms from the label words (>3 chars).
    selector: { matchType: pb.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3) },
    sortOrder: i,
  }));
  return { key: "contract-type-catalog", name: "Contract-type catalog", kind: "CONTRACT_TYPE_CATALOG", description: "One playbook per contract type; each item loads only when its cohort matches the ticket.", items, cohorts };
}

// ── Rule-engine corpora (taxonomy captured as editable RULE items) ───

const rulePack = (key, name, kind, description, rows) => ({
  key, name, kind, description,
  items: rows.map(([code, title, body], i) => ({ code, kind: "RULE", title, bodyMarkdown: body, data: {}, cohortTags: [], sortOrder: i })),
  cohorts: [],
});

export function noticeTaxonomyPack() {
  return rulePack("notice-taxonomy", "Notice taxonomy", "NOTICE_TAXONOMY", "How the Notice agent classifies notices and computes deadlines (the extraction logic stays in code).", [
    ["RULE.NOTICE.DEMAND", "Demand / breach letters", "Letters asserting a breach or demanding action carry a response or cure deadline — extract it and quote the source text."],
    ["RULE.NOTICE.REGULATOR", "Regulator / counsel correspondence", "Anything from a regulator or opposing counsel gets a human look regardless of how it's styled."],
    ["RULE.NOTICE.CURE", "Cure periods", "Contractual and statutory cure windows can conflict — compute both; the shorter binding one controls the SLA."],
    ["RULE.NOTICE.ACK", "Acknowledgment language", "Keep the acknowledgment minimal — even a receipt can waive rights if worded loosely."],
    ["RULE.NOTICE.VERIFY", "Deadline verification", "Every extracted or computed deadline must be verified against the cited source text before it drives an SLA."],
  ]);
}

export function privacyTriagePack() {
  return rulePack("privacy-triage", "Privacy triage signals", "PRIVACY_TRIAGE", "The thresholds the Privacy Assessment agent triages against (detection logic stays in code).", [
    ["RULE.PRIV.SPECIAL", "Special-category data", "Health, biometric, genetic, sexual-orientation, religion, or minors' data raises the assessment to high-impact; second-look indirect identifiers."],
    ["RULE.PRIV.TRANSFER", "Cross-border transfer triggers", "EU/UK personal data leaving the region needs a transfer mechanism (SCCs / adequacy) — flag it."],
    ["RULE.PRIV.DPIA", "DPIA thresholds", "Large-scale, novel-tech, or systematic-monitoring processing crosses the DPIA threshold — require one."],
    ["RULE.PRIV.PURPOSE", "Purpose limitation", "Approval covers the stated purpose only; downstream reuse is a new assessment — say so explicitly."],
  ]);
}

export function trademarkHeuristicsPack() {
  return rulePack("tm-heuristics", "Clearance heuristics", "REFERENCE", "The first-pass similarity heuristics the Trademark agent applies. NOT a registry search.", [
    ["RULE.TM.PHONETIC", "Phonetic similarity", "Sound-alike marks (same syllable stress / consonant skeleton) are a first-pass conflict signal."],
    ["RULE.TM.VISUAL", "Visual similarity", "Similar spelling, length, or dominant letters signal potential confusion."],
    ["RULE.TM.CLASS", "NICE class mapping", "Map the goods/services to NICE classes; conflicts matter within (and adjacent to) the same class."],
    ["RULE.TM.FORMAL", "Formal search is mandatory", "This is a preliminary read only — a formal USPTO/EUIPO/WIPO search is required before use."],
  ]);
}

export function caseBriefPack() {
  return rulePack("case-brief", "Case-brief structure", "REFERENCE", "The non-court-facing evidence-index structure the Litigation agent assembles.", [
    ["REF.BRIEF.PARTIES", "Parties & posture", "Identify the parties, their roles, and the procedural posture."],
    ["REF.BRIEF.DATES", "Key dates", "Extract filing / service / deadline dates from the intake."],
    ["REF.BRIEF.EVIDENCE", "Evidence index", "List documents referenced — this is an index, not a theory of the case; 'none found' ≠ 'none exist'."],
    ["REF.BRIEF.PRIVILEGE", "Privilege", "The brief itself is privileged — confirm access scope before circulating beyond the matter team."],
  ]);
}

export function sanctionsRulesPack() {
  return rulePack("sanctions-rules", "Sanctions screening rules", "REFERENCE", "The screening posture the Vendor agent applies (matching runs against the governed SanctionsListEntry feed).", [
    ["RULE.SANC.LISTS", "List coverage", "Screen against the configured lists (OFAC SDN/Consolidated, EU, UK, UN). Regimes not wired must be checked manually."],
    ["RULE.SANC.OWNERSHIP", "50% ownership rule", "Entities majority-owned by a sanctioned party may not be listed themselves — high-risk geographies need ownership diligence."],
    ["RULE.SANC.TRANSLIT", "Transliteration variants", "Name variants can slip fuzzy matching — a 'clear' is a screening result, not a guarantee."],
    ["RULE.SANC.POINTINTIME", "Point-in-time", "Lists change daily — rely on the re-screen cadence, not the onboarding clear."],
  ]);
}
