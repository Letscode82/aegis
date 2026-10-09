/**
 * ONE Legal skills (E1) — reusable legal-ops playbooks, authored for OneLegal.
 *
 * A "skill" is a curated, one-click starting action: it carries a structured
 * prompt (the playbook) and how to run it. Invoking a skill routes through the
 * SAME governed console pipeline as anything the user types — so a skill that
 * maps to a mutation still goes propose → human Approve → AgentDecision → act.
 * Skills add no new capability or gate; they make the good paths one click away
 * and surface them persistently in the rail's Skills section + the landing.
 *
 * These are OneLegal-native playbooks written in-house. The breadth is informed by
 * the open legal-skills ecosystem, but every entry is original and, crucially,
 * mapped to a REAL OneLegal capability — no vaporware:
 *   - "route"    → startTurn(prompt)     (intent router: ask / file / tool / compound)
 *   - "research" → startResearch(prompt) (the A1 read-only agent loop over the corpus)
 *   - "prefill"  → drop the prompt in the composer for the user to complete
 * `cats` are the intake categories the skill covers (used to highlight the skill
 * matching the most recent routed request). `category` groups the skill in the
 * rail; `featured` surfaces it on the landing (kept small so the landing stays
 * uncluttered). The full set lives in the rail, grouped by category.
 *
 * Design notes on action choice:
 *   - Reviews of a pasted document → "prefill" (ends with ": ").
 *   - Filing / creating something  → "route" (hits clarify-before-file + the
 *     intake agents / governed tool proposals).
 *   - Questions over our own docs / readiness assessments → "research" (A1),
 *     which degrades to a general grounded answer when the corpus is thin.
 *   - Operational / cross-module questions → "route" (answered via K2/K3).
 *
 * A later E1.x can persist org-authored skills (a Skill table + admin CRUD)
 * behind this same shape.
 */
export type SkillAction = "route" | "research" | "prefill";

/**
 * Where a skill's completed prompt is dispatched when the user submits it.
 *   - "draft"    → the editable artifact canvas (startArtifact) — for skills
 *                  whose output is a drafted document (a policy, notice, letter,
 *                  memo, resolution, plan, …).
 *   - "review"   → the governed deep skill-review playbook (runSkillReview) — for
 *                  skills that analyze / review / assess a pasted document or
 *                  situation. This matches the request to the right
 *                  @aegis/legal-skills playbook and NEVER files a ticket.
 *   - "research" → the read-only research agent (startResearch).
 *   - "route"    → the intent router (startTurn: ask / file / tool / compound) —
 *                  for skills that genuinely file an intake ticket or answer a
 *                  live cross-module query.
 *
 * This is the key fix for the "wrong response" class of bug: a prefill skill
 * must NOT be re-thrown through the intake triage classifier, which has no
 * category for "draft a whistleblower policy" and used to fall back to the
 * Privacy / DSAR intake form. The target is pinned to the skill, not re-derived
 * from the free text, so the surface a skill opens is deterministic.
 */
export type SkillTarget = "draft" | "review" | "research" | "route";

export interface OneLegalSkill {
  id: string;
  label: string;
  desc: string;
  icon: string;
  action: SkillAction;
  prompt: string;
  cats: string[];
  category: string;
  featured?: boolean;
  /**
   * Explicit submit target for a `prefill` skill (ignored for "route" /
   * "research" skills, whose `action` already dispatches). When omitted, a
   * prefill skill defaults to "review" — the governed playbook — so a new skill
   * can never silently file a mismatched intake ticket.
   */
  run?: SkillTarget;
  /**
   * SK-5 — when set, this skill is backed by a built `@aegis/legal-skills`
   * playbook (an id in the package registry). When a review-style skill is
   * dispatched to the governed `POST /api/one-legal/skill-review` endpoint, this
   * playbook id is passed so the shared standards + the skill's JSON output
   * contract are applied. Only the chip path uses it; typing the same text
   * freehand routes as before.
   */
  reviewSkillId?: string;
  /**
   * OL-6 — classifies the skill's origin so the catalog can surface the
   * platform's runnable primitives alongside the hand-authored E1 playbooks:
   *   - "playbook" (default/omitted) — an E1 or org-authored playbook.
   *   - "agent"  — one of the 11 oKF intake specialists (`agentId` links the
   *     registry row); dispatched through the governed review/research pipeline.
   *   - "ladder" — one of the 10 `GOVERNANCE_LIBRARY` governance ladders
   *     (`ladderKey` is the definition key); selecting it starts a governed
   *     workflow from the console via POST /api/one-legal/run-ladder.
   * Purely descriptive — it adds no capability or gate; agents and ladders run
   * through the same governed surfaces everything else does.
   */
  kind?: "playbook" | "agent" | "ladder";
  /** When kind === "agent": the intake registry agent id (e.g. "nda-agent"). */
  agentId?: string;
  /** When kind === "ladder": the GOVERNANCE_LIBRARY definition key. */
  ladderKey?: string;
}

/**
 * The surface a skill opens when its (completed) prompt is submitted.
 * Deterministic and pure — unit-tested against every skill in the catalog.
 */
export function resolveSkillTarget(skill: OneLegalSkill): SkillTarget {
  if (skill.action === "research") return "research";
  if (skill.action === "route") return "route";
  // prefill — explicit target wins; otherwise the safe playbook default.
  return skill.run ?? "review";
}

/** Display order for grouping skills in the rail. */
export const SKILL_CATEGORIES: string[] = [
  "Contracts & Commercial",
  "Privacy & Data Protection",
  "Compliance & Frameworks",
  "Sanctions & Trade",
  "Litigation & Disputes",
  "Legal Hold & eDiscovery",
  "Corporate & Governance",
  "Employment",
  "IP & Trademarks",
  "Legal Spend & Ops",
  "Outside Counsel",
  "Legal Research",
  "Drafting & Translation",
  "Cross-module · One Brain",
  "Agent specialists",
  "Governance ladders",
];

export const SKILLS: OneLegalSkill[] = [
  // ── Contracts & Commercial ────────────────────────────────────────────────
  { id: "nda-draft", label: "NDA auto-draft", desc: "Draft a standard mutual NDA from the playbook.", icon: "✎", action: "route", prompt: "Draft a standard mutual NDA", cats: ["NDA — Standard"], category: "Contracts & Commercial", featured: true },
  { id: "nda-review", label: "Review counterparty NDA", desc: "Check a counterparty's NDA against our playbook and flag deviations.", icon: "⇤", action: "prefill", prompt: "Review this counterparty NDA against our playbook and flag deviations: ", cats: ["NDA — Standard"], category: "Contracts & Commercial" },
  { id: "contract-review", label: "Contract risk review", desc: "Flag risks and deviations in a third-party contract.", icon: "⇤", action: "prefill", prompt: "Review this third-party contract for risks and deviations: ", cats: ["Vendor Contract"], category: "Contracts & Commercial", featured: true },
  { id: "msa-saas-review", label: "MSA / SaaS review", desc: "Review an MSA or SaaS agreement for liability, data, and termination risk.", icon: "⇤", action: "prefill", prompt: "Review this MSA/SaaS agreement for liability, data-protection, and termination risk: ", cats: ["Vendor Contract"], category: "Contracts & Commercial" },
  { id: "liability-cap", label: "Liability & indemnity check", desc: "Compare the liability cap and indemnities to our playbook positions.", icon: "◈", action: "prefill", prompt: "Check the limitation-of-liability and indemnity provisions in this contract against our playbook caps: ", cats: ["Vendor Contract"], category: "Contracts & Commercial" },
  { id: "dispute-clause", label: "Dispute-resolution clause", desc: "Review the governing-law / arbitration clause and propose a fallback.", icon: "§", action: "prefill", prompt: "Review the governing-law and dispute-resolution/arbitration clause and propose a fallback position: ", cats: ["Vendor Contract"], category: "Contracts & Commercial" },
  { id: "tos-scan", label: "Terms-of-service scan", desc: "Scan a ToS / click-through for risky clauses.", icon: "⇤", action: "prefill", prompt: "Scan these Terms of Service for risky or non-standard clauses and summarize the exposure: ", cats: ["Vendor Contract"], category: "Contracts & Commercial" },
  { id: "tech-negotiation", label: "Tech-contract negotiation", desc: "Prepare negotiation positions and fallbacks for a tech contract.", icon: "◈", action: "prefill", prompt: "Prepare negotiation positions, must-haves, and fallbacks for this technology contract: ", cats: ["Vendor Contract"], category: "Contracts & Commercial" },
  { id: "esg-clause", label: "ESG / climate clauses", desc: "Add climate / ESG-aligned clauses to a contract.", icon: "✎", action: "prefill", prompt: "Propose climate / ESG-aligned clauses to add to this contract and where they go: ", cats: [], category: "Contracts & Commercial" },
  { id: "playbook-check", label: "Playbook deviation check", desc: "Compare a contract to our clause playbook and list deviations.", icon: "⇤", action: "prefill", prompt: "Check this contract against our clause playbook and list every deviation with severity: ", cats: ["Vendor Contract"], category: "Contracts & Commercial" },

  // ── Privacy & Data Protection ─────────────────────────────────────────────
  { id: "dsar", label: "File a DSAR", desc: "File a data-subject access request.", icon: "◷", action: "route", prompt: "File a privacy DSAR for a data subject", cats: ["Privacy — DPIA / GDPR"], category: "Privacy & Data Protection", featured: true },
  { id: "dpia", label: "Start a DPIA", desc: "Open a privacy impact assessment for a new processing activity.", icon: "◉", action: "route", prompt: "Start a DPIA / privacy impact assessment for a new data-processing activity", cats: ["Privacy — DPIA / GDPR"], category: "Privacy & Data Protection" },
  { id: "dpa-review", label: "Review a DPA", desc: "Check a data processing agreement for GDPR Article 28 coverage.", icon: "⇤", action: "prefill", prompt: "Review this data processing agreement (DPA) for GDPR Article 28 compliance and flag gaps: ", cats: ["Privacy — DPIA / GDPR"], category: "Privacy & Data Protection" },
  { id: "breach-response", label: "Breach response", desc: "Assess notification obligations and next steps for a data incident.", icon: "⚑", action: "prefill", prompt: "Assess breach-notification obligations, timelines, and next steps for a personal-data incident involving: ", cats: ["Privacy — DPIA / GDPR"], category: "Privacy & Data Protection" },
  { id: "tia", label: "Transfer-impact assessment", desc: "Run a TIA for a cross-border data transfer.", icon: "◉", action: "prefill", prompt: "Run a transfer-impact assessment (TIA) for this cross-border data flow and recommend safeguards: ", cats: ["Privacy — DPIA / GDPR"], category: "Privacy & Data Protection" },
  { id: "lia", label: "Legitimate-interest assessment", desc: "Run an LIA for a processing purpose.", icon: "◉", action: "prefill", prompt: "Run a legitimate-interest assessment (LIA) — purpose, necessity, balancing — for: ", cats: [], category: "Privacy & Data Protection" },
  { id: "cookie-policy", label: "Cookie / consent notice", desc: "Draft a cookie policy / consent notice.", icon: "✎", action: "prefill", prompt: "Draft a cookie policy and consent notice for: ", run: "draft", cats: [], category: "Privacy & Data Protection" },
  { id: "ccpa", label: "CCPA / CPRA check", desc: "Assess CCPA/CPRA obligations and gaps.", icon: "🔎", action: "research", prompt: "Assess our CCPA/CPRA obligations and gaps, citing our documents, for: ", cats: [], category: "Privacy & Data Protection" },
  { id: "privacy-notice", label: "Draft privacy notice", desc: "Draft a privacy-notice section on the canvas.", icon: "✎", action: "prefill", prompt: "Draft a privacy notice section covering: ", run: "draft", cats: [], category: "Privacy & Data Protection" },

  // ── Compliance & Frameworks ───────────────────────────────────────────────
  { id: "eu-ai-act", label: "EU AI Act readiness", desc: "Assess EU AI Act obligations and likely risk tier.", icon: "⬡", action: "research", prompt: "Assess our EU AI Act obligations and likely risk tier for an AI system we are deploying, citing our documents", cats: [], category: "Compliance & Frameworks", featured: true },
  { id: "ai-act-classify", label: "AI Act risk classifier", desc: "Classify an AI system's EU AI Act risk tier + obligations.", icon: "⬡", action: "prefill", prompt: "Classify this AI system's EU AI Act risk tier and list the resulting obligations: ", cats: [], category: "Compliance & Frameworks" },
  { id: "dora", label: "DORA resilience", desc: "Summarize DORA operational-resilience obligations and gaps.", icon: "⬡", action: "research", prompt: "Summarize our DORA operational-resilience obligations and gaps for a critical ICT third-party provider", cats: [], category: "Compliance & Frameworks" },
  { id: "nis2", label: "NIS2 check", desc: "Assess NIS2 obligations and gaps.", icon: "⬡", action: "research", prompt: "Assess our NIS2 obligations and gaps, citing our documents, for: ", cats: [], category: "Compliance & Frameworks" },
  { id: "soc2", label: "SOC 2 readiness", desc: "Assess SOC 2 control readiness and gaps.", icon: "⬡", action: "research", prompt: "Assess our SOC 2 readiness and control gaps from our documents", cats: [], category: "Compliance & Frameworks" },
  { id: "iso27001", label: "ISO 27001 readiness", desc: "Assess ISO 27001 control readiness and gaps.", icon: "⬡", action: "research", prompt: "Assess our ISO 27001 readiness and Annex A control gaps from our documents", cats: [], category: "Compliance & Frameworks" },
  { id: "hipaa", label: "HIPAA check", desc: "Assess HIPAA compliance gaps.", icon: "⬡", action: "research", prompt: "Assess our HIPAA compliance gaps, citing our documents, for: ", cats: [], category: "Compliance & Frameworks" },
  { id: "framework-gap", label: "Framework gap check", desc: "Assess readiness against any named framework and list gaps.", icon: "⬡", action: "prefill", prompt: "Assess our readiness against this framework and list the gaps and owners: ", cats: [], category: "Compliance & Frameworks" },
  { id: "whistleblower-policy", label: "Whistleblower policy", desc: "Draft or update a whistleblower policy.", icon: "✎", action: "prefill", prompt: "Draft or update a whistleblower / speak-up policy for: ", run: "draft", cats: [], category: "Compliance & Frameworks" },

  // ── Sanctions & Trade ─────────────────────────────────────────────────────
  { id: "sanctions-screen", label: "Sanctions / OFAC screen", desc: "Screen a counterparty for sanctions / OFAC exposure.", icon: "◎", action: "route", prompt: "Screen this counterparty for sanctions and OFAC exposure", cats: ["Compliance — Sanctions"], category: "Sanctions & Trade", featured: true },
  { id: "vendor-dd", label: "Vendor due diligence", desc: "Run diligence on a new vendor (sanctions + jurisdiction + data).", icon: "◎", action: "route", prompt: "Run due diligence on a new vendor, including sanctions, jurisdiction, and data-protection risk", cats: ["Vendor DD"], category: "Sanctions & Trade" },
  { id: "export-control", label: "Export-control check", desc: "Assess EAR/ITAR and export-control exposure.", icon: "◎", action: "prefill", prompt: "Assess export-control (EAR/ITAR) and sanctions exposure for: ", cats: ["Compliance — Sanctions"], category: "Sanctions & Trade" },
  { id: "screening-adjudication", label: "Screening adjudication", desc: "Adjudicate a sanctions screening alert with rationale.", icon: "◎", action: "prefill", prompt: "Adjudicate this sanctions screening alert (true vs false positive) with a documented rationale: ", cats: ["Compliance — Sanctions"], category: "Sanctions & Trade" },

  // ── Litigation & Disputes ─────────────────────────────────────────────────
  { id: "open-matter", label: "Open a matter", desc: "Open a new litigation / dispute matter.", icon: "◫", action: "prefill", prompt: "Open a new litigation matter for a dispute with ", run: "route", cats: ["Litigation — Non-Court"], category: "Litigation & Disputes" },
  { id: "demand-letter", label: "Demand-letter triage", desc: "Triage a received demand letter: urgency, deadlines, preservation.", icon: "⚑", action: "prefill", prompt: "We received a demand letter — triage the urgency, response deadlines, and preservation obligations: ", cats: ["Litigation — Non-Court"], category: "Litigation & Disputes" },
  { id: "cpr-letter", label: "Pre-action / CPR letter", desc: "Draft a pre-action / CPR letter.", icon: "✎", action: "prefill", prompt: "Draft a pre-action / CPR letter for: ", run: "draft", cats: ["Litigation — Non-Court"], category: "Litigation & Disputes" },
  { id: "chronology", label: "Build a chronology", desc: "Assemble a dated chronology of events from our documents.", icon: "🔎", action: "research", prompt: "Build a dated chronology of the key events for this matter from our documents, with citations", cats: [], category: "Litigation & Disputes" },
  { id: "disclosure-list", label: "Disclosure list", desc: "Build a disclosure / document list for a matter.", icon: "▤", action: "prefill", prompt: "Build a disclosure / document list for this matter, grouped and privilege-flagged: ", run: "draft", cats: [], category: "Litigation & Disputes" },
  { id: "deadline-calendar", label: "Deadline calendar", desc: "Build a litigation deadline calendar from dates/rules.", icon: "◷", action: "prefill", prompt: "Build a litigation deadline calendar from these dates and procedural rules: ", run: "draft", cats: [], category: "Litigation & Disputes" },
  { id: "opposing-counsel-review", label: "Opposing-counsel review", desc: "Stress-test our position from the other side's view.", icon: "◈", action: "prefill", prompt: "Stress-test our position as opposing counsel would — find the weak points and likely attacks: ", cats: [], category: "Litigation & Disputes" },
  { id: "settlement-pressure", label: "Settlement pressure-test", desc: "Pressure-test a settlement position (BATNA, ranges, leverage).", icon: "◈", action: "prefill", prompt: "Pressure-test our settlement position — BATNA, realistic ranges, and leverage — for: ", cats: [], category: "Litigation & Disputes" },

  // ── Legal Hold & eDiscovery (OneLegal go-beyond) ─────────────────────────────
  { id: "legal-hold", label: "Legal hold", desc: "Open a preservation hold on a matter.", icon: "⚖", action: "route", prompt: "Start a legal hold on the matter", cats: ["Litigation — Non-Court"], category: "Legal Hold & eDiscovery", featured: true },
  { id: "custodian-manage", label: "Add custodians / sources", desc: "Add custodians and data sources to a hold.", icon: "◫", action: "prefill", prompt: "Add custodians and data sources to the legal hold for: ", run: "route", cats: [], category: "Legal Hold & eDiscovery" },
  { id: "preservation-notice", label: "Preservation notice", desc: "Draft a hold / preservation notice for custodians.", icon: "✎", action: "prefill", prompt: "Draft a preservation / legal-hold notice for custodians about: ", run: "draft", cats: [], category: "Legal Hold & eDiscovery" },
  { id: "defensibility", label: "Defensibility scorecard", desc: "Review a hold's defensibility score and gaps.", icon: "◉", action: "route", prompt: "Show the legal-hold defensibility scorecard and the gaps to close", cats: [], category: "Legal Hold & eDiscovery" },
  { id: "ediscovery", label: "eDiscovery review set", desc: "Start an eDiscovery review set for a matter's custodians.", icon: "⛁", action: "prefill", prompt: "Start an eDiscovery review set for the matter covering custodians: ", run: "route", cats: [], category: "Legal Hold & eDiscovery" },

  // ── Corporate & Governance ────────────────────────────────────────────────
  { id: "board-resolution", label: "Board resolution", desc: "Draft a board resolution / written consent.", icon: "✎", action: "prefill", prompt: "Draft a board resolution / written consent for: ", run: "draft", cats: [], category: "Corporate & Governance" },
  { id: "entity-formation", label: "Entity formation", desc: "Prepare a new-subsidiary formation checklist.", icon: "◫", action: "prefill", prompt: "Prepare an entity-formation checklist for a new subsidiary in: ", run: "draft", cats: [], category: "Corporate & Governance" },
  { id: "fdi-check", label: "FDI / foreign investment", desc: "Assess foreign-investment / FDI approval requirements.", icon: "🔎", action: "research", prompt: "Assess foreign-investment / FDI approval requirements for a transaction in: ", cats: [], category: "Corporate & Governance" },
  { id: "governance-attest", label: "Governance attestation", desc: "Prepare a governance / committee attestation.", icon: "✎", action: "prefill", prompt: "Prepare a governance / committee attestation for: ", run: "draft", cats: [], category: "Corporate & Governance" },

  // ── Employment ────────────────────────────────────────────────────────────
  { id: "employment-intake", label: "Employment matter", desc: "File a sensitive employment matter.", icon: "⚑", action: "prefill", prompt: "File an employment matter (e.g. grievance, dismissal, or workplace investigation): ", run: "route", cats: ["Employment — Sensitive"], category: "Employment" },
  { id: "dismissal-screen", label: "Dismissal screen", desc: "Screen a dismissal for unfair-dismissal risk.", icon: "⇤", action: "prefill", prompt: "Screen this proposed dismissal for unfair-dismissal risk and process gaps: ", cats: ["Employment — Sensitive"], category: "Employment" },
  { id: "settlement-review", label: "Settlement review", desc: "Review a settlement / severance agreement.", icon: "⇤", action: "prefill", prompt: "Review this settlement / severance agreement for risk, enforceability, and missing protections: ", cats: ["Employment — Sensitive"], category: "Employment" },

  // ── IP & Trademarks ───────────────────────────────────────────────────────
  { id: "trademark-clearance", label: "Trademark clearance", desc: "Screen a proposed brand / trademark name.", icon: "™", action: "prefill", prompt: "Screen a proposed brand/trademark name for clearance and conflicts: ", cats: ["IP / Trademark / OSS"], category: "IP & Trademarks" },
  { id: "ip-assignment", label: "IP assignment review", desc: "Review an IP assignment / transfer.", icon: "⇤", action: "prefill", prompt: "Review this IP assignment/transfer agreement and confirm scope of rights, consideration, and warranties: ", cats: ["IP / Trademark / OSS"], category: "IP & Trademarks" },
  { id: "copyright-originality", label: "Copyright originality", desc: "Assess copyright subsistence / originality.", icon: "🔎", action: "prefill", prompt: "Assess copyright subsistence and originality for: ", cats: ["IP / Trademark / OSS"], category: "IP & Trademarks" },

  // ── Legal Spend & Ops ─────────────────────────────────────────────────────
  { id: "invoice-review", label: "Invoice review", desc: "Review an outside-counsel invoice against budget + guidelines.", icon: "⇤", action: "prefill", prompt: "Review this outside-counsel invoice against the matter budget and our billing guidelines: ", cats: [], category: "Legal Spend & Ops" },
  { id: "spend-summary", label: "Spend summary", desc: "See legal spend this quarter by matter and vendor.", icon: "◴", action: "route", prompt: "How much legal spend do we have this quarter, by matter and vendor, and how much budget is left?", cats: [], category: "Legal Spend & Ops" },
  { id: "budget-build", label: "Matter budget", desc: "Build a matter budget and fee estimate.", icon: "▤", action: "prefill", prompt: "Build a matter budget and fee estimate (phases, assumptions, ranges) for: ", run: "draft", cats: [], category: "Legal Spend & Ops" },
  { id: "matter-scope", label: "Matter intake scoping", desc: "Scope a new matter: issues, budget, staffing.", icon: "◫", action: "prefill", prompt: "Scope a new matter — issues, risks, budget, and staffing — for: ", run: "draft", cats: [], category: "Legal Spend & Ops" },
  { id: "matter-plan", label: "Matter plan", desc: "Build a matter plan with phases, tasks, milestones.", icon: "▤", action: "prefill", prompt: "Build a matter plan with phases, tasks, owners, and milestones for: ", run: "draft", cats: [], category: "Legal Spend & Ops" },
  { id: "status-report", label: "Status report", desc: "Draft a matter status report.", icon: "▤", action: "prefill", prompt: "Draft a concise matter status report (progress, risks, next steps, spend) for: ", cats: [], category: "Legal Spend & Ops" },

  // ── Outside Counsel ───────────────────────────────────────────────────────
  { id: "oc-performance", label: "Outside-counsel review", desc: "Review outside-counsel performance and billing.", icon: "⇤", action: "prefill", prompt: "Review outside-counsel performance and billing (quality, budget adherence, outcomes) on: ", cats: [], category: "Outside Counsel" },
  { id: "rfp-pitch", label: "RFP / panel brief", desc: "Draft an RFP / panel pitch brief.", icon: "▤", action: "prefill", prompt: "Draft an RFP / law-firm-panel pitch brief for: ", run: "draft", cats: [], category: "Outside Counsel" },
  { id: "engagement-terms", label: "Engagement terms", desc: "Draft engagement terms + billing guidelines.", icon: "✎", action: "prefill", prompt: "Draft engagement terms and billing guidelines for outside counsel on: ", run: "draft", cats: [], category: "Outside Counsel" },
  { id: "local-counsel", label: "Local-counsel instruction", desc: "Prepare a local-counsel instruction for a jurisdiction.", icon: "✎", action: "prefill", prompt: "Prepare a local-counsel instruction (scope, questions, deadlines) for jurisdiction: ", run: "draft", cats: [], category: "Outside Counsel" },

  // ── Legal Research ────────────────────────────────────────────────────────
  { id: "corpus-research", label: "Research the corpus", desc: "Multi-step research across your documents, with citations.", icon: "🔎", action: "research", prompt: "Summarize the key risks and obligations across our documents", cats: [], category: "Legal Research", featured: true },
  { id: "statute-analyzer", label: "Statute analyzer", desc: "Analyze a statute/regulation and its application.", icon: "🔎", action: "prefill", prompt: "Analyze this statute/regulation and how it applies to our situation: ", cats: [], category: "Legal Research" },
  { id: "multi-juris-research", label: "Multi-jurisdiction research", desc: "Research a question across jurisdictions.", icon: "🔎", action: "prefill", prompt: "Research this question across the relevant jurisdictions and compare: ", cats: [], category: "Legal Research" },
  { id: "citation-verify", label: "Citation verification", desc: "Verify citations/quotes in a draft against sources.", icon: "⇤", action: "prefill", prompt: "Verify every citation and quote in this draft against our source documents and flag anything unsupported: ", cats: [], category: "Legal Research" },
  { id: "case-law-search", label: "Case-law search", desc: "Find and summarize case law on a question.", icon: "🔎", action: "prefill", prompt: "Find and summarize the relevant case law on: ", cats: [], category: "Legal Research" },

  // ── Drafting & Translation ────────────────────────────────────────────────
  { id: "memo", label: "Draft a memo", desc: "Open the canvas on a memo you can edit and save.", icon: "▤", action: "prefill", prompt: "Draft a memo summarizing ", run: "draft", cats: [], category: "Drafting & Translation", featured: true },
  { id: "legal-notice", label: "Draft a legal notice", desc: "Draft a formal legal notice or letter on the canvas.", icon: "✎", action: "prefill", prompt: "Draft a formal legal notice regarding ", run: "draft", cats: [], category: "Drafting & Translation" },
  { id: "summarize-doc", label: "Summarize a document", desc: "Summarize a document; pull key dates, parties, obligations.", icon: "▤", action: "prefill", prompt: "Summarize this document and extract the key dates, parties, and obligations: ", cats: [], category: "Drafting & Translation" },
  { id: "plain-language", label: "Plain-language rewrite", desc: "Rewrite legal text for a business audience.", icon: "✎", action: "prefill", prompt: "Rewrite this legal text in plain language for a business audience, keeping the meaning exact: ", cats: [], category: "Drafting & Translation" },
  { id: "legal-translation", label: "Legal translation", desc: "Translate legal text, preserving legal meaning.", icon: "✎", action: "prefill", prompt: "Translate this legal text into the requested language, preserving legal meaning and defined terms: ", run: "draft", cats: [], category: "Drafting & Translation" },

  // ── Cross-module · One Brain (OneLegal go-beyond) ────────────────────────────
  { id: "everything-about", label: "Everything about…", desc: "One-brain view across matters, contracts, holds, spend.", icon: "◎", action: "prefill", prompt: "Show me everything we have on ", run: "route", cats: [], category: "Cross-module · One Brain" },
  { id: "open-contracts", label: "Open contracts", desc: "Live count + list of open contracts.", icon: "◴", action: "route", prompt: "What contracts are open right now?", cats: [], category: "Cross-module · One Brain" },
  { id: "holds-overview", label: "Holds overview", desc: "Which matters have active legal holds.", icon: "⚖", action: "route", prompt: "Which matters have active legal holds?", cats: [], category: "Cross-module · One Brain" },
  { id: "intake-queue", label: "Intake queue", desc: "How many intake tickets are open, by status.", icon: "◷", action: "route", prompt: "How many intake tickets are open, by status?", cats: [], category: "Cross-module · One Brain" },

  // ── Agent specialists (OL-6) ──────────────────────────────────────────────
  // The 11 oKF intake specialists, one-click. Each runs through the governed
  // review/research pipeline — it produces a recommendation and never mutates
  // or bypasses the human approve keystroke. `agentId` links the registry row.
  { id: "agent-nda", kind: "agent", agentId: "nda-agent", label: "NDA specialist", desc: "Review an NDA against our standard template; flag only the deviations.", icon: "◉", action: "prefill", run: "review", prompt: "Review this NDA against our standard mutual template and flag every deviation with severity: ", cats: ["NDA — Standard"], category: "Agent specialists" },
  { id: "agent-contract-review", kind: "agent", agentId: "contract-review-agent", label: "Contract review specialist", desc: "Flag risks and playbook deviations in a third-party contract.", icon: "◐", action: "prefill", run: "review", prompt: "Review this third-party contract for risks and playbook deviations: ", cats: ["Vendor Contract"], category: "Agent specialists" },
  { id: "agent-contract-specialist", kind: "agent", agentId: "contract-specialist-agent", label: "Contract-type specialist", desc: "Identify the contract type and apply the right playbook lens.", icon: "◈", action: "prefill", run: "review", prompt: "Identify this contract's type and review it against the matching playbook: ", cats: ["Vendor Contract"], category: "Agent specialists" },
  { id: "agent-trademark", kind: "agent", agentId: "trademark-agent", label: "Trademark clearance specialist", desc: "Screen a mark for clearance risk.", icon: "◇", action: "prefill", run: "review", prompt: "Screen this trademark for clearance risk and summarize conflicts: ", cats: [], category: "Agent specialists" },
  { id: "agent-litigation", kind: "agent", agentId: "litigation-agent", label: "Litigation intake specialist", desc: "Triage a new dispute and flag legal-hold triggers.", icon: "§", action: "prefill", run: "review", prompt: "Triage this new dispute, flag any legal-hold trigger, and recommend next steps: ", cats: [], category: "Agent specialists" },
  { id: "agent-notice", kind: "agent", agentId: "notice-mgmt-agent", label: "Notice management specialist", desc: "Extract every deadline and claim from a legal notice, with sources.", icon: "⚑", action: "prefill", run: "review", prompt: "Extract every deadline and claim from this legal/statutory notice, citing each source: ", cats: [], category: "Agent specialists" },
  { id: "agent-vendor", kind: "agent", agentId: "vendor-intake-agent", label: "Vendor screening specialist", desc: "Run sanctions / debarment screening on a vendor or counterparty.", icon: "⬡", action: "prefill", run: "review", prompt: "Screen this vendor / counterparty for sanctions and debarment risk: ", cats: [], category: "Agent specialists" },
  { id: "agent-privacy", kind: "agent", agentId: "privacy-assessment-agent", label: "Privacy assessment specialist", desc: "Assess a data incident's severity and notification obligations.", icon: "◉", action: "prefill", run: "review", prompt: "Assess this data incident's severity and notification obligations: ", cats: ["Privacy — DPIA / GDPR"], category: "Agent specialists" },
  { id: "agent-marketing", kind: "agent", agentId: "marketing-review-agent", label: "Marketing review specialist", desc: "Review marketing copy for legal and regulatory claims risk.", icon: "◭", action: "prefill", run: "review", prompt: "Review this marketing copy for legal and regulatory claims risk: ", cats: [], category: "Agent specialists" },
  { id: "agent-faq", kind: "agent", agentId: "faq-agent", label: "Legal FAQ specialist", desc: "Answer a common legal question from our knowledge base.", icon: "◈", action: "research", prompt: "Answer this legal question from our knowledge base, citing our documents: ", cats: [], category: "Agent specialists" },
  { id: "agent-policy-qa", kind: "agent", agentId: "policy-qa-agent", label: "Policy Q&A specialist", desc: "Answer a question against our internal policies.", icon: "◎", action: "research", prompt: "Answer this question against our internal policies, citing the relevant policy: ", cats: [], category: "Agent specialists" },

  // ── Governance ladders (OL-6) ─────────────────────────────────────────────
  // The 10 GOVERNANCE_LIBRARY ladders, startable from the console. Selecting
  // one calls POST /api/one-legal/run-ladder, which starts a governed
  // WorkflowInstance — AGENT steps queue a PENDING task for a human to approve
  // and never auto-advance. `ladderKey` is the definition key.
  { id: "ladder-nda_fasttrack", kind: "ladder", ladderKey: "nda_fasttrack", label: "NDA Fast-Track", desc: "Mutual/one-way NDAs: AI template review, then only deviations reach legal.", icon: "⚖", action: "route", prompt: "Start the NDA Fast-Track governance ladder.", cats: ["NDA — Standard"], category: "Governance ladders", featured: true },
  { id: "ladder-clm_contract_approval", kind: "ladder", ladderKey: "clm_contract_approval", label: "Contract Approval Ladder", desc: "Commercial contracts: supply, distribution, licensing, services.", icon: "⚖", action: "route", prompt: "Start the Contract Approval governance ladder.", cats: ["Vendor Contract"], category: "Governance ladders" },
  { id: "ladder-patent_litigation", kind: "ladder", ladderKey: "patent_litigation", label: "Patent / ANDA Litigation", desc: "Hatch-Waxman Para IV: hard 45-day statutory window with antitrust review.", icon: "⚖", action: "route", prompt: "Start the Patent / ANDA Litigation governance ladder.", cats: [], category: "Governance ladders" },
  { id: "ladder-legal_notice", kind: "ladder", ladderKey: "legal_notice", label: "Legal Notice Response", desc: "Statutory/demand notices: AI deadline extraction, then counsel finalizes.", icon: "⚖", action: "route", prompt: "Start the Legal Notice Response governance ladder.", cats: [], category: "Governance ladders" },
  { id: "ladder-regulatory_response", kind: "ladder", ladderKey: "regulatory_response", label: "Regulatory Action Response", desc: "483 / warning letters / pricing notices, cross-functional with Quality.", icon: "⚖", action: "route", prompt: "Start the Regulatory Action Response governance ladder.", cats: [], category: "Governance ladders" },
  { id: "ladder-vendor_onboarding", kind: "ladder", ladderKey: "vendor_onboarding", label: "Vendor Due Diligence", desc: "Onboarding: AI sanctions/debarment screen, then compliance clears.", icon: "⚖", action: "route", prompt: "Start the Vendor / Counterparty Due Diligence governance ladder.", cats: [], category: "Governance ladders" },
  { id: "ladder-compliance_investigation", kind: "ladder", ladderKey: "compliance_investigation", label: "Compliance Investigation", desc: "Whistleblower / UCPMP / anti-bribery, confidential with closure report.", icon: "⚖", action: "route", prompt: "Start the Compliance Investigation governance ladder.", cats: [], category: "Governance ladders" },
  { id: "ladder-data_breach", kind: "ladder", ladderKey: "data_breach", label: "Data Privacy Incident", desc: "72-hour DPDP breach clock: the tightest SLAs in the library.", icon: "⚖", action: "route", prompt: "Start the Data Privacy Incident governance ladder.", cats: ["Privacy — DPIA / GDPR"], category: "Governance ladders" },
  { id: "ladder-employment_matter", kind: "ladder", ladderKey: "employment_matter", label: "Employment / POSH Matter", desc: "Disciplinary, separation and POSH-committee matters with statutory timelines.", icon: "⚖", action: "route", prompt: "Start the Employment / POSH Matter governance ladder.", cats: [], category: "Governance ladders" },
  { id: "ladder-board_approval", kind: "ladder", ladderKey: "board_approval", label: "Board / Secretarial Approval", desc: "POAs, authorised-signatory changes, disclosures and resolutions.", icon: "⚖", action: "route", prompt: "Start the Board / Secretarial Approval governance ladder.", cats: [], category: "Governance ladders" },
];

// SK-5 — pin review/analysis skills to a built @aegis/legal-skills playbook.
// Deliberately excludes the route-to-file skills (legal-hold, vendor DD intake,
// DPIA open, …): those must keep their governed filing path, not become a
// read-only playbook read. Each value is an id that exists + is `status:"built"`
// in the package registry (packages/legal-skills/dist/registry.json).
const REVIEW_PLAYBOOK: Record<string, string> = {
  // Contracts & commercial
  "nda-review": "contracts/nda-triage",
  "contract-review": "contracts/contract-review",
  "msa-saas-review": "contracts/contract-review",
  "playbook-check": "contracts/contract-review",
  "tos-scan": "contracts/contract-review",
  // Privacy
  "dpa-review": "privacy/dpa-review",
  "breach-response": "privacy/breach-response",
  // Compliance / regulatory
  "ai-act-classify": "regulatory/ai-governance",
  // Litigation & disputes
  "demand-letter": "disputes/early-case-assessment",
  "opposing-counsel-review": "disputes/adversarial-stress-test",
  "settlement-pressure": "disputes/adversarial-stress-test",
  // Employment
  "dismissal-screen": "employment/termination-risk",
  // Spend / outside counsel
  "invoice-review": "outside-counsel/invoice-review",
  // IP
  // Research & drafting
  "citation-verify": "research/citation-verification",
  "plain-language": "drafting/plain-language-explainer",
  // Ops
  "status-report": "matters/status-report",
};
for (const s of SKILLS) {
  const pid = REVIEW_PLAYBOOK[s.id];
  if (pid) s.reviewSkillId = pid;
}
