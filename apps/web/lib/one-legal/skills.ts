/**
 * ONE Legal skills (E1) — reusable legal-ops playbooks, authored for AEGIS.
 *
 * A "skill" is a curated, one-click starting action: it carries a structured
 * prompt (the playbook) and how to run it. Invoking a skill routes through the
 * SAME governed console pipeline as anything the user types — so a skill that
 * maps to a mutation still goes propose → human Approve → AgentDecision → act.
 * Skills add no new capability or gate; they make the good paths one click away
 * and surface them persistently in the rail's Skills section + the landing.
 *
 * These are AEGIS-native playbooks written in-house. The breadth is informed by
 * the open legal-skills ecosystem, but every entry is original and, crucially,
 * mapped to a REAL AEGIS capability — no vaporware:
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
  { id: "cookie-policy", label: "Cookie / consent notice", desc: "Draft a cookie policy / consent notice.", icon: "✎", action: "prefill", prompt: "Draft a cookie policy and consent notice for: ", cats: [], category: "Privacy & Data Protection" },
  { id: "ccpa", label: "CCPA / CPRA check", desc: "Assess CCPA/CPRA obligations and gaps.", icon: "🔎", action: "research", prompt: "Assess our CCPA/CPRA obligations and gaps, citing our documents, for: ", cats: [], category: "Privacy & Data Protection" },
  { id: "privacy-notice", label: "Draft privacy notice", desc: "Draft a privacy-notice section on the canvas.", icon: "✎", action: "prefill", prompt: "Draft a privacy notice section covering: ", cats: [], category: "Privacy & Data Protection" },

  // ── Compliance & Frameworks ───────────────────────────────────────────────
  { id: "eu-ai-act", label: "EU AI Act readiness", desc: "Assess EU AI Act obligations and likely risk tier.", icon: "⬡", action: "research", prompt: "Assess our EU AI Act obligations and likely risk tier for an AI system we are deploying, citing our documents", cats: [], category: "Compliance & Frameworks", featured: true },
  { id: "ai-act-classify", label: "AI Act risk classifier", desc: "Classify an AI system's EU AI Act risk tier + obligations.", icon: "⬡", action: "prefill", prompt: "Classify this AI system's EU AI Act risk tier and list the resulting obligations: ", cats: [], category: "Compliance & Frameworks" },
  { id: "dora", label: "DORA resilience", desc: "Summarize DORA operational-resilience obligations and gaps.", icon: "⬡", action: "research", prompt: "Summarize our DORA operational-resilience obligations and gaps for a critical ICT third-party provider", cats: [], category: "Compliance & Frameworks" },
  { id: "nis2", label: "NIS2 check", desc: "Assess NIS2 obligations and gaps.", icon: "⬡", action: "research", prompt: "Assess our NIS2 obligations and gaps, citing our documents, for: ", cats: [], category: "Compliance & Frameworks" },
  { id: "soc2", label: "SOC 2 readiness", desc: "Assess SOC 2 control readiness and gaps.", icon: "⬡", action: "research", prompt: "Assess our SOC 2 readiness and control gaps from our documents", cats: [], category: "Compliance & Frameworks" },
  { id: "iso27001", label: "ISO 27001 readiness", desc: "Assess ISO 27001 control readiness and gaps.", icon: "⬡", action: "research", prompt: "Assess our ISO 27001 readiness and Annex A control gaps from our documents", cats: [], category: "Compliance & Frameworks" },
  { id: "hipaa", label: "HIPAA check", desc: "Assess HIPAA compliance gaps.", icon: "⬡", action: "research", prompt: "Assess our HIPAA compliance gaps, citing our documents, for: ", cats: [], category: "Compliance & Frameworks" },
  { id: "framework-gap", label: "Framework gap check", desc: "Assess readiness against any named framework and list gaps.", icon: "⬡", action: "prefill", prompt: "Assess our readiness against this framework and list the gaps and owners: ", cats: [], category: "Compliance & Frameworks" },
  { id: "whistleblower-policy", label: "Whistleblower policy", desc: "Draft or update a whistleblower policy.", icon: "✎", action: "prefill", prompt: "Draft or update a whistleblower / speak-up policy for: ", cats: [], category: "Compliance & Frameworks" },

  // ── Sanctions & Trade ─────────────────────────────────────────────────────
  { id: "sanctions-screen", label: "Sanctions / OFAC screen", desc: "Screen a counterparty for sanctions / OFAC exposure.", icon: "◎", action: "route", prompt: "Screen this counterparty for sanctions and OFAC exposure", cats: ["Compliance — Sanctions"], category: "Sanctions & Trade", featured: true },
  { id: "vendor-dd", label: "Vendor due diligence", desc: "Run diligence on a new vendor (sanctions + jurisdiction + data).", icon: "◎", action: "route", prompt: "Run due diligence on a new vendor, including sanctions, jurisdiction, and data-protection risk", cats: ["Vendor DD"], category: "Sanctions & Trade" },
  { id: "export-control", label: "Export-control check", desc: "Assess EAR/ITAR and export-control exposure.", icon: "◎", action: "prefill", prompt: "Assess export-control (EAR/ITAR) and sanctions exposure for: ", cats: ["Compliance — Sanctions"], category: "Sanctions & Trade" },
  { id: "screening-adjudication", label: "Screening adjudication", desc: "Adjudicate a sanctions screening alert with rationale.", icon: "◎", action: "prefill", prompt: "Adjudicate this sanctions screening alert (true vs false positive) with a documented rationale: ", cats: ["Compliance — Sanctions"], category: "Sanctions & Trade" },

  // ── Litigation & Disputes ─────────────────────────────────────────────────
  { id: "open-matter", label: "Open a matter", desc: "Open a new litigation / dispute matter.", icon: "◫", action: "prefill", prompt: "Open a new litigation matter for a dispute with ", cats: ["Litigation — Non-Court"], category: "Litigation & Disputes" },
  { id: "demand-letter", label: "Demand-letter triage", desc: "Triage a received demand letter: urgency, deadlines, preservation.", icon: "⚑", action: "prefill", prompt: "We received a demand letter — triage the urgency, response deadlines, and preservation obligations: ", cats: ["Litigation — Non-Court"], category: "Litigation & Disputes" },
  { id: "cpr-letter", label: "Pre-action / CPR letter", desc: "Draft a pre-action / CPR letter.", icon: "✎", action: "prefill", prompt: "Draft a pre-action / CPR letter for: ", cats: ["Litigation — Non-Court"], category: "Litigation & Disputes" },
  { id: "chronology", label: "Build a chronology", desc: "Assemble a dated chronology of events from our documents.", icon: "🔎", action: "research", prompt: "Build a dated chronology of the key events for this matter from our documents, with citations", cats: [], category: "Litigation & Disputes" },
  { id: "disclosure-list", label: "Disclosure list", desc: "Build a disclosure / document list for a matter.", icon: "▤", action: "prefill", prompt: "Build a disclosure / document list for this matter, grouped and privilege-flagged: ", cats: [], category: "Litigation & Disputes" },
  { id: "deadline-calendar", label: "Deadline calendar", desc: "Build a litigation deadline calendar from dates/rules.", icon: "◷", action: "prefill", prompt: "Build a litigation deadline calendar from these dates and procedural rules: ", cats: [], category: "Litigation & Disputes" },
  { id: "opposing-counsel-review", label: "Opposing-counsel review", desc: "Stress-test our position from the other side's view.", icon: "◈", action: "prefill", prompt: "Stress-test our position as opposing counsel would — find the weak points and likely attacks: ", cats: [], category: "Litigation & Disputes" },
  { id: "settlement-pressure", label: "Settlement pressure-test", desc: "Pressure-test a settlement position (BATNA, ranges, leverage).", icon: "◈", action: "prefill", prompt: "Pressure-test our settlement position — BATNA, realistic ranges, and leverage — for: ", cats: [], category: "Litigation & Disputes" },

  // ── Legal Hold & eDiscovery (AEGIS go-beyond) ─────────────────────────────
  { id: "legal-hold", label: "Legal hold", desc: "Open a preservation hold on a matter.", icon: "⚖", action: "route", prompt: "Start a legal hold on the matter", cats: ["Litigation — Non-Court"], category: "Legal Hold & eDiscovery", featured: true },
  { id: "custodian-manage", label: "Add custodians / sources", desc: "Add custodians and data sources to a hold.", icon: "◫", action: "prefill", prompt: "Add custodians and data sources to the legal hold for: ", cats: [], category: "Legal Hold & eDiscovery" },
  { id: "preservation-notice", label: "Preservation notice", desc: "Draft a hold / preservation notice for custodians.", icon: "✎", action: "prefill", prompt: "Draft a preservation / legal-hold notice for custodians about: ", cats: [], category: "Legal Hold & eDiscovery" },
  { id: "defensibility", label: "Defensibility scorecard", desc: "Review a hold's defensibility score and gaps.", icon: "◉", action: "route", prompt: "Show the legal-hold defensibility scorecard and the gaps to close", cats: [], category: "Legal Hold & eDiscovery" },
  { id: "ediscovery", label: "eDiscovery review set", desc: "Start an eDiscovery review set for a matter's custodians.", icon: "⛁", action: "prefill", prompt: "Start an eDiscovery review set for the matter covering custodians: ", cats: [], category: "Legal Hold & eDiscovery" },

  // ── Corporate & Governance ────────────────────────────────────────────────
  { id: "board-resolution", label: "Board resolution", desc: "Draft a board resolution / written consent.", icon: "✎", action: "prefill", prompt: "Draft a board resolution / written consent for: ", cats: [], category: "Corporate & Governance" },
  { id: "entity-formation", label: "Entity formation", desc: "Prepare a new-subsidiary formation checklist.", icon: "◫", action: "prefill", prompt: "Prepare an entity-formation checklist for a new subsidiary in: ", cats: [], category: "Corporate & Governance" },
  { id: "fdi-check", label: "FDI / foreign investment", desc: "Assess foreign-investment / FDI approval requirements.", icon: "🔎", action: "research", prompt: "Assess foreign-investment / FDI approval requirements for a transaction in: ", cats: [], category: "Corporate & Governance" },
  { id: "governance-attest", label: "Governance attestation", desc: "Prepare a governance / committee attestation.", icon: "✎", action: "prefill", prompt: "Prepare a governance / committee attestation for: ", cats: [], category: "Corporate & Governance" },

  // ── Employment ────────────────────────────────────────────────────────────
  { id: "employment-intake", label: "Employment matter", desc: "File a sensitive employment matter.", icon: "⚑", action: "prefill", prompt: "File an employment matter (e.g. grievance, dismissal, or workplace investigation): ", cats: ["Employment — Sensitive"], category: "Employment" },
  { id: "dismissal-screen", label: "Dismissal screen", desc: "Screen a dismissal for unfair-dismissal risk.", icon: "⇤", action: "prefill", prompt: "Screen this proposed dismissal for unfair-dismissal risk and process gaps: ", cats: ["Employment — Sensitive"], category: "Employment" },
  { id: "settlement-review", label: "Settlement review", desc: "Review a settlement / severance agreement.", icon: "⇤", action: "prefill", prompt: "Review this settlement / severance agreement for risk, enforceability, and missing protections: ", cats: ["Employment — Sensitive"], category: "Employment" },

  // ── IP & Trademarks ───────────────────────────────────────────────────────
  { id: "trademark-clearance", label: "Trademark clearance", desc: "Screen a proposed brand / trademark name.", icon: "™", action: "prefill", prompt: "Screen a proposed brand/trademark name for clearance and conflicts: ", cats: ["IP / Trademark / OSS"], category: "IP & Trademarks" },
  { id: "ip-assignment", label: "IP assignment review", desc: "Review an IP assignment / transfer.", icon: "⇤", action: "prefill", prompt: "Review this IP assignment/transfer agreement and confirm scope of rights, consideration, and warranties: ", cats: ["IP / Trademark / OSS"], category: "IP & Trademarks" },
  { id: "copyright-originality", label: "Copyright originality", desc: "Assess copyright subsistence / originality.", icon: "🔎", action: "prefill", prompt: "Assess copyright subsistence and originality for: ", cats: ["IP / Trademark / OSS"], category: "IP & Trademarks" },

  // ── Legal Spend & Ops ─────────────────────────────────────────────────────
  { id: "invoice-review", label: "Invoice review", desc: "Review an outside-counsel invoice against budget + guidelines.", icon: "⇤", action: "prefill", prompt: "Review this outside-counsel invoice against the matter budget and our billing guidelines: ", cats: [], category: "Legal Spend & Ops" },
  { id: "spend-summary", label: "Spend summary", desc: "See legal spend this quarter by matter and vendor.", icon: "◴", action: "route", prompt: "How much legal spend do we have this quarter, by matter and vendor, and how much budget is left?", cats: [], category: "Legal Spend & Ops" },
  { id: "budget-build", label: "Matter budget", desc: "Build a matter budget and fee estimate.", icon: "▤", action: "prefill", prompt: "Build a matter budget and fee estimate (phases, assumptions, ranges) for: ", cats: [], category: "Legal Spend & Ops" },
  { id: "matter-scope", label: "Matter intake scoping", desc: "Scope a new matter: issues, budget, staffing.", icon: "◫", action: "prefill", prompt: "Scope a new matter — issues, risks, budget, and staffing — for: ", cats: [], category: "Legal Spend & Ops" },
  { id: "matter-plan", label: "Matter plan", desc: "Build a matter plan with phases, tasks, milestones.", icon: "▤", action: "prefill", prompt: "Build a matter plan with phases, tasks, owners, and milestones for: ", cats: [], category: "Legal Spend & Ops" },
  { id: "status-report", label: "Status report", desc: "Draft a matter status report.", icon: "▤", action: "prefill", prompt: "Draft a concise matter status report (progress, risks, next steps, spend) for: ", cats: [], category: "Legal Spend & Ops" },

  // ── Outside Counsel ───────────────────────────────────────────────────────
  { id: "oc-performance", label: "Outside-counsel review", desc: "Review outside-counsel performance and billing.", icon: "⇤", action: "prefill", prompt: "Review outside-counsel performance and billing (quality, budget adherence, outcomes) on: ", cats: [], category: "Outside Counsel" },
  { id: "rfp-pitch", label: "RFP / panel brief", desc: "Draft an RFP / panel pitch brief.", icon: "▤", action: "prefill", prompt: "Draft an RFP / law-firm-panel pitch brief for: ", cats: [], category: "Outside Counsel" },
  { id: "engagement-terms", label: "Engagement terms", desc: "Draft engagement terms + billing guidelines.", icon: "✎", action: "prefill", prompt: "Draft engagement terms and billing guidelines for outside counsel on: ", cats: [], category: "Outside Counsel" },
  { id: "local-counsel", label: "Local-counsel instruction", desc: "Prepare a local-counsel instruction for a jurisdiction.", icon: "✎", action: "prefill", prompt: "Prepare a local-counsel instruction (scope, questions, deadlines) for jurisdiction: ", cats: [], category: "Outside Counsel" },

  // ── Legal Research ────────────────────────────────────────────────────────
  { id: "corpus-research", label: "Research the corpus", desc: "Multi-step research across your documents, with citations.", icon: "🔎", action: "research", prompt: "Summarize the key risks and obligations across our documents", cats: [], category: "Legal Research", featured: true },
  { id: "statute-analyzer", label: "Statute analyzer", desc: "Analyze a statute/regulation and its application.", icon: "🔎", action: "prefill", prompt: "Analyze this statute/regulation and how it applies to our situation: ", cats: [], category: "Legal Research" },
  { id: "multi-juris-research", label: "Multi-jurisdiction research", desc: "Research a question across jurisdictions.", icon: "🔎", action: "prefill", prompt: "Research this question across the relevant jurisdictions and compare: ", cats: [], category: "Legal Research" },
  { id: "citation-verify", label: "Citation verification", desc: "Verify citations/quotes in a draft against sources.", icon: "⇤", action: "prefill", prompt: "Verify every citation and quote in this draft against our source documents and flag anything unsupported: ", cats: [], category: "Legal Research" },
  { id: "case-law-search", label: "Case-law search", desc: "Find and summarize case law on a question.", icon: "🔎", action: "prefill", prompt: "Find and summarize the relevant case law on: ", cats: [], category: "Legal Research" },

  // ── Drafting & Translation ────────────────────────────────────────────────
  { id: "memo", label: "Draft a memo", desc: "Open the canvas on a memo you can edit and save.", icon: "▤", action: "prefill", prompt: "Draft a memo summarizing ", cats: [], category: "Drafting & Translation", featured: true },
  { id: "legal-notice", label: "Draft a legal notice", desc: "Draft a formal legal notice or letter on the canvas.", icon: "✎", action: "prefill", prompt: "Draft a formal legal notice regarding ", cats: [], category: "Drafting & Translation" },
  { id: "summarize-doc", label: "Summarize a document", desc: "Summarize a document; pull key dates, parties, obligations.", icon: "▤", action: "prefill", prompt: "Summarize this document and extract the key dates, parties, and obligations: ", cats: [], category: "Drafting & Translation" },
  { id: "plain-language", label: "Plain-language rewrite", desc: "Rewrite legal text for a business audience.", icon: "✎", action: "prefill", prompt: "Rewrite this legal text in plain language for a business audience, keeping the meaning exact: ", cats: [], category: "Drafting & Translation" },
  { id: "legal-translation", label: "Legal translation", desc: "Translate legal text, preserving legal meaning.", icon: "✎", action: "prefill", prompt: "Translate this legal text into the requested language, preserving legal meaning and defined terms: ", cats: [], category: "Drafting & Translation" },

  // ── Cross-module · One Brain (AEGIS go-beyond) ────────────────────────────
  { id: "everything-about", label: "Everything about…", desc: "One-brain view across matters, contracts, holds, spend.", icon: "◎", action: "prefill", prompt: "Show me everything we have on ", cats: [], category: "Cross-module · One Brain" },
  { id: "open-contracts", label: "Open contracts", desc: "Live count + list of open contracts.", icon: "◴", action: "route", prompt: "What contracts are open right now?", cats: [], category: "Cross-module · One Brain" },
  { id: "holds-overview", label: "Holds overview", desc: "Which matters have active legal holds.", icon: "⚖", action: "route", prompt: "Which matters have active legal holds?", cats: [], category: "Cross-module · One Brain" },
  { id: "intake-queue", label: "Intake queue", desc: "How many intake tickets are open, by status.", icon: "◷", action: "route", prompt: "How many intake tickets are open, by status?", cats: [], category: "Cross-module · One Brain" },
];
