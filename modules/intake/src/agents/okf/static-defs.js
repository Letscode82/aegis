// ── Static oKF definitions for the 11 agents ─────────────────────────
//
// The canonical, code-shipped spec for every agent, encoding TODAY's
// behaviour as data. Two consumers:
//   1. the seed (packages/db/prisma/seed.ts) upserts these into
//      AgentDefinition + KnowledgePack rows — the DB starting point the
//      Agent Designer edits;
//   2. the client runtime falls back to these when the published DB def
//      can't be fetched, so the browser demo never breaks.
//
// risks + playbook are pulled from agent-profiles.js so there's one source
// of truth. Routing / model / prompt / output / knowledge are encoded here;
// the code corpora are migrated into real items (migrated-corpora.js).
//
// executionMode: "okf" agents (contract-review, trademark, litigation) run
// entirely from their published definition via the generic runtime — the
// Designer's edits drive live output. Litigation composes the "counterparty"
// tool (oKF-7) for its deterministic record pull + output.alwaysConcerns for
// its mandatory hold-trigger flag. "code" agents whose deterministic step
// GATES the action (sanctions hit → escalate, deadline math) keep process(),
// still reading their oKF knowledge/config where the code consumes it.
import { AGENT_PROFILES } from "../agent-profiles";
import { normalizeDocument } from "./serialize";
import {
  approvedKbPack,
  policyCorpusPack,
  claimsLibraryPack,
  contractTypeCatalogPack,
  noticeTaxonomyPack,
  privacyTriagePack,
  trademarkHeuristicsPack,
  caseBriefPack,
  sanctionsRulesPack,
} from "./migrated-corpora";

const ATTORNEY_RISK = "Attorney sign-off required before execution — this is a first-pass review.";

// Compact contract playbook → oKF CLAUSE items (real migration of the
// contract-review agent's inline CONTRACT_PLAYBOOK). Each tuple is
// [code, title, standardText, risk, fallbackText, guidance] — fallbackText +
// guidance carry the richer negotiation positions the Contracts 📖 Playbook
// screen renders (this pack IS that screen's store now).
const CONTRACT_CLAUSES = [
  ["C.LIAB.CAP", "Limitation of liability", "Cap = 12 months' fees; uncapped carve-outs for IP infringement, confidentiality breach, indemnity, gross negligence/willful misconduct. Reject unlimited liability or no cap.", "HIGH", "24 months' fees with the same carve-outs.", "Reject unlimited liability or no cap. Confirm the carve-outs survive the cap."],
  ["C.INDEMNITY", "Indemnification", "Mutual, third-party claims only. Reject unlimited or first-party indemnities.", "HIGH", "One-way indemnity from the vendor covering third-party IP and data-breach claims.", "Reject unlimited or first-party indemnities."],
  ["C.GOV.LAW", "Governing law", "Delaware preferred; NY/CA acceptable. Avoid counterparty's home jurisdiction for non-US.", "MEDIUM", "New York or California.", "Avoid the counterparty's home jurisdiction for non-US counterparties."],
  ["C.PAYMENT", "Payment terms", "Net 45 (Net 30 only with ≥2% prompt-pay discount).", "LOW", "Net 30 with a prompt-pay discount of at least 2%.", "Reject advance / upfront payment for services."],
  ["C.AUTORENEW", "Auto-renewal", "Acceptable only if non-renewal notice ≤60 days AND uplift capped.", "MEDIUM", "90-day notice window with a CPI-capped uplift.", "Reject evergreen renewal with no notice window or an uncapped uplift."],
  ["C.TERM.CONV", "Termination for convenience", "We want 30 days' notice. Pure term-lock with no exit = flag.", "MEDIUM", "60 days' written notice.", "Pure term-lock with no exit right is a flag."],
  ["C.PRICE.INC", "Price increases", "Capped at lesser of 5% or CPI.", "MEDIUM", "CPI-linked with an annual cap of 5%.", "Reject uncapped or vendor-discretion price increases."],
  ["C.ASSIGN", "Assignment", "No assignment without consent (affiliate/M&A successor OK); termination right on change of control to a competitor.", "MEDIUM", "Consent not to be unreasonably withheld.", "Reject free assignment to any third party."],
  ["C.WARRANTY", "Warranty / acceptance", "90-day warranty + 30-day acceptance. Avoid AS-IS for paid deliverables.", "MEDIUM", "60-day warranty.", "Avoid AS-IS for paid deliverables."],
  ["C.IP", "Intellectual property", "Present-tense assignment of deliverables; license-back for background IP.", "HIGH", "Assignment on final payment.", "Reject ambiguous, undefined, or joint ownership of deliverables / derivative works."],
];

function clauseItems() {
  return CONTRACT_CLAUSES.map(([code, title, body, risk, fallbackText, guidance], i) => ({
    code,
    kind: "CLAUSE",
    title,
    bodyMarkdown: body,
    // riskIfDeviated is the field the Contracts playbook editor writes;
    // severityIfDeviated is kept as the legacy alias the reader also accepts.
    data: { riskIfDeviated: risk, severityIfDeviated: risk, fallbackText, guidance },
    cohortTags: [],
    sortOrder: i,
  }));
}

function prof(key) {
  const p = AGENT_PROFILES[key] || {};
  return { risks: p.risks || [], playbook: p.playbook || { id: "", version: "" } };
}

// One-agent factory: fills identity + routing + model + prompt + output.
function agentDef(a) {
  const p = prof(a.key);
  return normalizeDocument({
    okfVersion: 1,
    agent: {
      key: a.key,
      name: a.name,
      shortName: a.shortName || null,
      icon: a.icon || null,
      description: a.description || null,
      enabled: true,
      productionReady: a.productionReady !== false,
      displayOrder: a.displayOrder || 0,
      executionMode: a.executionMode || "code",
      tools: a.tools || [],
      routing: a.routing || {},
      model: a.model || { maxTokens: 1500, timeout: 30000, maxDocChars: 9000 },
      prompt: a.prompt,
      output: a.output || {},
      risks: p.risks,
      playbook: p.playbook,
      approverRole: a.approverRole || null,
    },
    knowledge: a.knowledge || [],
  });
}

export const STATIC_AGENT_DEFS = [
  agentDef({
    key: "nda-agent",
    name: "NDA Agent",
    shortName: "NDA",
    icon: "🔐",
    description: "Reviews NDA requests against the approved template, checks for prior NDAs with the counterparty, and drafts a response.",
    displayOrder: 1,
    routing: { matchType: ["nda"], matchKeyword: ["nda", "non-disclosure", "confidentiality agreement"], excludeKeyword: [] },
    model: { maxTokens: 1500, timeout: 30000, maxDocChars: 9000 },
    output: { autoSendAtConfidence: 0.85, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the NDA Agent for AEGIS Legal. Review the NDA request from {{ticket.from}} ({{ticket.dept}}) against our approved template and note any deviations.\n\nApproved template + standards:\n{{knowledge}}\n\nRequest / document:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON (draftedResponse 120-200 words; use \\n for line breaks):\n{"draftedResponse":"response to the requester","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["..."]}`,
      fallbackTemplate: `You are the NDA Agent for AEGIS Legal. Review this NDA request against our approved template and write a concise (150-word) response to {{ticket.firstName}} noting any deviations. Plain text only.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.from", "ticket.dept", "ticket.firstName", "ticket.desc", "knowledge"],
    },
    knowledge: [{
      key: "nda-template",
      name: "NDA template",
      kind: "TEMPLATE",
      description: "The approved mutual/one-way NDA the agent drafts from.",
      items: [{ code: "TPL.MNDA", kind: "TEMPLATE", title: "Mutual NDA (MNDA v4.2)", bodyMarkdown: "Standard mutual NDA: 3-year term, mutual confidentiality, standard carve-outs (public / independently developed / lawfully received), Delaware governing law.", data: { variant: "mutual" }, cohortTags: [], sortOrder: 0 }],
      cohorts: [],
    }],
  }),
  agentDef({
    key: "vendor-intake-agent",
    name: "Vendor Intake Agent",
    shortName: "Vendor",
    icon: "🏢",
    description: "Screens new vendors/counterparties against sanctions and denied-party lists before onboarding.",
    displayOrder: 2,
    routing: { matchType: ["vendor", "supplier", "procurement"], matchKeyword: ["vendor onboarding", "new supplier", "sanctions"], excludeKeyword: [] },
    model: { maxTokens: 1200, timeout: 30000, maxDocChars: 6000 },
    output: { autoSendAtConfidence: 0.9, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Vendor Intake Agent for AEGIS Legal. Summarize the sanctions/denied-party screening posture for the vendor described and recommend next steps.\n\nScreening rules:\n{{knowledge}}\n\nRequest:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"screening summary","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["..."]}`,
      fallbackTemplate: `You are the Vendor Intake Agent. Summarize the screening posture for this vendor and recommend next steps in ~120 words. Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [sanctionsRulesPack()],
  }),
  agentDef({
    key: "contract-specialist-agent",
    name: "Contract-Type Specialist",
    shortName: "Specialist",
    icon: "◆",
    description: "Selects the right per-contract-type playbook (MSA, DPA, SaaS, supply…) and reviews against it; unmatched types fall through to the generalist reviewer.",
    displayOrder: 3,
    routing: { matchCategory: ["contract"], matchType: ["msa", "dpa", "saas", "supply", "license"], matchKeyword: [], excludeKeyword: ["nda"], requiresDocument: false },
    model: { maxTokens: 1800, timeout: 45000, maxDocChars: 9000 },
    output: { autoSendAtConfidence: 0.85, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [{ id: "CONTRACT-TYPE-CATALOG", title: "Contract-Type Playbook Catalog" }] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Contract-Type Specialist for AEGIS Legal. Identify the contract type, select the matching playbook, and review the document against it clause by clause.\n\nType playbooks:\n{{knowledge}}\n\nDocument:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON (draftedResponse 160-240 words):\n{"draftedResponse":"review with the selected playbook named + deviations","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["${ATTORNEY_RISK}","..."]}`,
      fallbackTemplate: `You are the Contract-Type Specialist. Name the contract type + matching playbook, review against it, and write a ~200-word review to {{ticket.firstName}} ending with attorney sign-off required. Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.firstName", "ticket.desc", "knowledge"],
    },
    knowledge: [contractTypeCatalogPack()],
  }),
  agentDef({
    key: "contract-review-agent",
    name: "Contract Review Agent",
    shortName: "Contract",
    icon: "◐",
    description: "AI-assisted first-pass contract review: extracts key clauses, compares them to our playbook, flags deviations with severity, and drafts a redline summary. Recommends attorney sign-off before execution.",
    displayOrder: 4,
    executionMode: "okf",
    routing: { matchCategory: ["contract review", "msa", "sow", "redline"], matchType: ["contract review", "contract"], matchKeyword: [], excludeKeyword: ["nda"], requiresDocument: false },
    model: { maxTokens: 1800, timeout: 45000, maxDocChars: 9000 },
    output: { autoSendAtConfidence: 0.85, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [{ id: "PLAYBOOK-MSA-v2", title: "MSA / Contract Playbook" }] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Contract Review Agent for AEGIS Legal. Do a FIRST-PASS review of the contract below, comparing its terms against our playbook. Review clause by clause where the text is present; otherwise review what's described and call out what still needs the full text.\n\nAEGIS Contract Playbook (defaults to check against):\n{{knowledge}}\n\nFor EVERY issue you flag, assign a severity: BLOCKER / HIGH / MEDIUM / LOW, worst first.\n\nTICKET:\n- Requester: {{ticket.from}} ({{ticket.dept}})\n- Description / document:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON (keep draftedResponse 160-240 words; use \\n for line breaks; no double-quotes inside the string):\n{"draftedResponse":"review summary with a bulleted deviations list","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["${ATTORNEY_RISK}","...key deviations the attorney must confirm"]}`,
      fallbackTemplate: `You are the Contract Review Agent for AEGIS Legal. Do a FIRST-PASS review of the contract below against this playbook, then write a concise review (180-240 words) to {{ticket.firstName}} that names the key clauses, flags each deviation with a severity (BLOCKER/HIGH/MEDIUM/LOW, worst first) as a bulleted list, notes what still needs the full document, and ends by stating attorney sign-off is required before execution. Plain text only.\n\n{{knowledge}}\n\nTICKET:\n- Requester: {{ticket.from}} ({{ticket.dept}})\n"""\n{{ticket.desc}}\n"""`,
      variables: ["ticket.from", "ticket.dept", "ticket.firstName", "ticket.desc", "knowledge"],
    },
    knowledge: [{
      key: "contract-clauses",
      name: "Contract clause library",
      kind: "CONTRACT_CLAUSES",
      description: "The risk-term checklist the reviewer flags against. Editable in the Knowledge tab; the same store the Contracts 📖 Playbook screen reads.",
      items: clauseItems(),
      cohorts: [],
    }],
  }),
  agentDef({
    key: "trademark-agent",
    name: "Trademark Clearance Agent",
    shortName: "TM",
    icon: "◇",
    description: "Real knock-out screen (phonetic + visual + NICE-class) against the registered-marks table, then an AI clearance memo interpreting the conflicts. Always recommends a formal registry search. Tool-augmented — the deterministic screen is code; stays executionMode:code.",
    productionReady: true,
    displayOrder: 5,
    executionMode: "code",
    routing: { matchType: ["trademark", "tm clearance", "brand"], matchKeyword: ["trademark", "clearance", "brand name"], excludeKeyword: [] },
    model: { maxTokens: 1200, timeout: 30000, maxDocChars: 5000 },
    output: { autoSendAtConfidence: 0.95, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Trademark Agent for AEGIS Legal. Provide a PRELIMINARY clearance read (phonetic/visual/conceptual similarity + likely NICE classes) for the mark described. State clearly this is not a registry search.\n\nHeuristics:\n{{knowledge}}\n\nRequest:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"preliminary read","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["A formal USPTO/EUIPO/WIPO search is mandatory before use.","..."]}`,
      fallbackTemplate: `You are the Trademark Agent. Give a ~120-word preliminary clearance read for this mark, stating a formal search is mandatory. Plain text.\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [trademarkHeuristicsPack()],
  }),
  agentDef({
    key: "litigation-agent",
    name: "Litigation Intake Agent",
    shortName: "Litigation",
    icon: "§",
    description: "Assembles a cited case brief for non-court-facing disputes: pulls the record (prior matters/agreements) via the counterparty tool, flags the legal-hold trigger, recommends a handling tier. Never places a hold; always attorney-reviewed.",
    displayOrder: 6,
    // oKF-7: runs entirely from this definition. Its deterministic record
    // pull is the "counterparty" tool (context, not a gate); the mandatory
    // hold-trigger + conflicts + deadline concerns ride output.alwaysConcerns
    // so they survive even the degraded path; never auto-sends.
    executionMode: "okf",
    tools: ["counterparty"],
    routing: { matchType: ["litigation", "dispute", "claim", "lawsuit"], matchKeyword: ["lawsuit", "litigation", "dispute", "subpoena", "complaint"], excludeKeyword: [] },
    model: { maxTokens: 1200, timeout: 40000, maxDocChars: 2500 },
    output: {
      autoSendAtConfidence: 2, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "flag-for-review", precedentLinks: [],
      alwaysConcerns: [
        "Legal-hold trigger flagged (over-inclusive by design): evaluate preservation NOW — no hold has been placed by this triage.",
        "Run a conflicts check against existing matters/counterparties before staffing.",
        "Confirm the response deadline.",
      ],
    },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Litigation Support Agent for AEGIS Legal. Assemble a CITED CASE BRIEF for an inbound NON-COURT-FACING litigation/dispute matter (demand letter, subpoena, pre-litigation dispute, notice of claim). You do NOT initiate a legal hold — never claim to have placed one.\n\nRECORD PULL (authoritative — cite as given, do NOT invent or extend):\n- {{tool.counterparty}}\n\nStructure the brief: 1. PARTIES · 2. CONTRACT LANDSCAPE (only what the record pull states) · 3. CHRONOLOGY · 4. EXPOSURE (claim type + severity: routine/elevated/critical) · 5. RELATED MATTERS (only from the record pull) · 6. OPEN OBLIGATIONS (deadlines) · 7. GAP ANALYSIS (mandatory final section — what the record does NOT contain; "nothing found" never reads as "nothing exists"). Recommend a handling tier: junior review, or escalate to senior litigation counsel.\n\nTICKET:\n- Requester: {{ticket.from}} ({{ticket.dept}})\n- Description: "{{ticket.desc}}"\n\nThis brief is an EVIDENCE INDEX, not a theory of the case. Always attorney-reviewed — never auto-final.`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"the case brief with the 7 numbered sections, \\n line breaks, 200-300 words","alternativeTone":"one-line summary","confidence":0.0-1.0,"reasoning":"one-line basis for the tier","concerns":["...items the attorney must confirm"]}`,
      fallbackTemplate: `You are the Litigation Support Agent. Assemble a concise cited case brief (parties, chronology, exposure, open obligations, and a mandatory GAP ANALYSIS) for {{ticket.firstName}} from the intake below and the record pull. Never claim to have placed a hold. Plain text.\n\nRECORD PULL: {{tool.counterparty}}\n\n"""\n{{ticket.desc}}\n"""`,
      variables: ["ticket.from", "ticket.dept", "ticket.firstName", "ticket.desc", "tool.counterparty"],
    },
    knowledge: [caseBriefPack()],
  }),
  agentDef({
    key: "notice-mgmt-agent",
    name: "Notice Management Agent",
    shortName: "Notice",
    icon: "📨",
    description: "Classifies inbound legal notices, extracts and computes deadlines, and drafts a minimal acknowledgment. Every deadline is human-verified.",
    displayOrder: 7,
    routing: { matchType: ["notice", "demand", "correspondence"], matchKeyword: ["notice", "demand letter", "deadline", "cure period"], excludeKeyword: [] },
    model: { maxTokens: 1500, timeout: 40000, maxDocChars: 8000 },
    output: { autoSendAtConfidence: 0.9, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Notice Management Agent for AEGIS Legal. Classify the notice below, extract EVERY deadline (quote the source text for each), compute response/cure windows, and draft a minimal acknowledgment.\n\nNotice taxonomy + rules:\n{{knowledge}}\n\nNotice:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"classification + deadlines (with source quotes) + acknowledgment draft","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["Verify EVERY extracted deadline against the cited source text.","..."]}`,
      fallbackTemplate: `You are the Notice Management Agent. Classify this notice, list every deadline with the source quote, and draft a minimal acknowledgment (~180 words). Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [noticeTaxonomyPack()],
  }),
  agentDef({
    key: "privacy-assessment-agent",
    name: "Privacy Assessment Agent",
    shortName: "Privacy",
    icon: "🛡",
    description: "Triages privacy/DPIA requests: special categories, transfer triggers, DPIA thresholds. Approval covers the stated purpose only.",
    displayOrder: 8,
    routing: { matchType: ["privacy", "dpia", "data protection"], matchKeyword: ["privacy", "dpia", "personal data", "gdpr", "data transfer"], excludeKeyword: [] },
    model: { maxTokens: 1600, timeout: 40000, maxDocChars: 8000 },
    output: { autoSendAtConfidence: 0.88, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Privacy Assessment Agent for AEGIS Legal. Triage the processing described below: identify special categories, cross-border transfer triggers, and whether a DPIA threshold is crossed.\n\nTriage signals:\n{{knowledge}}\n\nRequest:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"triage result + recommended next step","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["Approval covers the stated purpose only; downstream reuse is a new assessment.","..."]}`,
      fallbackTemplate: `You are the Privacy Assessment Agent. Triage this processing (special categories, transfer triggers, DPIA threshold) in ~160 words. Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [privacyTriagePack()],
  }),
  agentDef({
    key: "marketing-review-agent",
    name: "Marketing Review Agent",
    shortName: "Marketing",
    icon: "📣",
    description: "Reviews marketing claims against the approved-claims library and substantiation flags; fast-tracks pre-cleared claims.",
    displayOrder: 9,
    routing: { matchType: ["marketing", "advertising", "claims"], matchKeyword: ["marketing", "advertising", "claim", "campaign", "substantiation"], excludeKeyword: [] },
    model: { maxTokens: 1400, timeout: 35000, maxDocChars: 7000 },
    output: { autoSendAtConfidence: 0.88, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Marketing Review Agent for AEGIS Legal. Review the marketing content below against our approved-claims library; flag unsubstantiated, implied, or market-divergent claims.\n\nClaims library:\n{{knowledge}}\n\nContent:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"review + flagged claims + verdict","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["Verify the market tag on every fast-track.","..."]}`,
      fallbackTemplate: `You are the Marketing Review Agent. Review this content against the approved-claims library and flag issues (~160 words). Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [claimsLibraryPack()],
  }),
  agentDef({
    key: "faq-agent",
    name: "FAQ Agent",
    shortName: "FAQ",
    icon: "💬",
    description: "Answers routine legal questions from the approved knowledge base. Errs toward hand-off on any wrinkle.",
    displayOrder: 10,
    routing: { matchType: ["question", "faq", "general"], matchKeyword: ["how do i", "question", "policy on", "can i"], excludeKeyword: [] },
    model: { maxTokens: 1200, timeout: 30000, maxDocChars: 5000 },
    output: { autoSendAtConfidence: 0.9, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the FAQ Agent for AEGIS Legal. Answer the question below ONLY from the approved knowledge base. If the question hides a non-standard circumstance, recommend hand-off instead of answering.\n\nApproved KB:\n{{knowledge}}\n\nQuestion:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"answer or hand-off recommendation","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["..."]}`,
      fallbackTemplate: `You are the FAQ Agent. Answer this from the approved KB, or recommend hand-off if it's non-standard (~120 words). Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [approvedKbPack()],
  }),
  agentDef({
    key: "policy-qa-agent",
    name: "Policy Q&A Agent",
    shortName: "Policy",
    icon: "📚",
    description: "Answers questions against the internal policy corpus. Correct-to-the-document, which is not always correct-to-the-organisation.",
    displayOrder: 11,
    routing: { matchType: ["policy", "policy question"], matchKeyword: ["policy", "our policy", "are we allowed", "compliance"], excludeKeyword: [] },
    model: { maxTokens: 1200, timeout: 30000, maxDocChars: 6000 },
    output: { autoSendAtConfidence: 0.9, degradedConfidence: 0.4, defaultAction: "flag-for-review", autoSendAction: "approve-and-send", precedentLinks: [] },
    prompt: {
      mode: "json",
      systemTemplate: `You are the Policy Q&A Agent for AEGIS Legal. Answer the question below from the internal policy corpus, citing the specific policy. If policies conflict, flag it rather than resolving it.\n\nPolicy corpus:\n{{knowledge}}\n\nQuestion:\n"""\n{{ticket.desc}}\n"""`,
      jsonContract: `Respond with ONLY this JSON:\n{"draftedResponse":"answer with policy citation","confidence":0.0-1.0,"reasoning":"one-line basis","concerns":["Answer is correct-to-the-document; confirm current-version hygiene.","..."]}`,
      fallbackTemplate: `You are the Policy Q&A Agent. Answer this from the policy corpus with a citation, flagging any conflict (~140 words). Plain text.\n\n{{knowledge}}\n\n{{ticket.desc}}`,
      variables: ["ticket.desc", "knowledge"],
    },
    knowledge: [policyCorpusPack()],
  }),
];

export function staticDefForKey(agentKey) {
  return STATIC_AGENT_DEFS.find((d) => d.agent.key === agentKey) || null;
}
