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
 * These are AEGIS-native playbooks written in-house (not imported from any
 * third-party skill catalog), each mapped to a real AEGIS capability:
 *   - "route"    → startTurn(prompt)     (intent router: ask / file / tool / compound)
 *   - "research" → startResearch(prompt) (the A1 read-only agent loop over the corpus)
 *   - "prefill"  → drop the prompt in the composer for the user to complete
 * `cats` are the intake categories the skill covers — used only to highlight
 * the skill matching the most recent routed request. `category` groups the
 * skill in the rail; `featured` surfaces it on the landing (kept small so the
 * landing stays uncluttered). The full set lives in the rail, grouped.
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
  "Compliance & Sanctions",
  "Litigation & Disputes",
  "Employment",
  "IP & Trademarks",
  "Legal Spend",
  "Governance & Regulatory",
  "Research & Drafting",
];

export const SKILLS: OneLegalSkill[] = [
  // ── Contracts & Commercial ────────────────────────────────────────────────
  {
    id: "nda-draft",
    label: "NDA auto-draft",
    desc: "Draft a standard mutual NDA from the playbook.",
    icon: "✎",
    action: "route",
    prompt: "Draft a standard mutual NDA",
    cats: ["NDA — Standard"],
    category: "Contracts & Commercial",
    featured: true,
  },
  {
    id: "nda-review",
    label: "Review counterparty NDA",
    desc: "Check a counterparty's NDA against our playbook and flag deviations.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this counterparty NDA against our playbook and flag deviations: ",
    cats: ["NDA — Standard"],
    category: "Contracts & Commercial",
  },
  {
    id: "contract-review",
    label: "Contract risk review",
    desc: "Flag risks and deviations in a third-party contract.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this third-party contract for risks and deviations: ",
    cats: ["Vendor Contract"],
    category: "Contracts & Commercial",
    featured: true,
  },
  {
    id: "msa-saas-review",
    label: "MSA / SaaS review",
    desc: "Review an MSA or SaaS agreement for liability, data, and termination risk.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this MSA/SaaS agreement for liability, data-protection, and termination risk: ",
    cats: ["Vendor Contract"],
    category: "Contracts & Commercial",
  },
  {
    id: "liability-cap",
    label: "Liability & indemnity check",
    desc: "Compare the liability cap and indemnities to our playbook positions.",
    icon: "◈",
    action: "prefill",
    prompt: "Check the limitation-of-liability and indemnity provisions in this contract against our playbook caps: ",
    cats: ["Vendor Contract"],
    category: "Contracts & Commercial",
  },
  {
    id: "dispute-clause",
    label: "Dispute-resolution clause",
    desc: "Review the governing-law / arbitration clause and propose a fallback.",
    icon: "§",
    action: "prefill",
    prompt: "Review the governing-law and dispute-resolution/arbitration clause and propose a fallback position: ",
    cats: ["Vendor Contract"],
    category: "Contracts & Commercial",
  },
  {
    id: "renewals",
    label: "Expiring contracts",
    desc: "See which contracts are expiring or up for renewal soon.",
    icon: "◷",
    action: "route",
    prompt: "Which contracts are open or expiring within the next 90 days?",
    cats: [],
    category: "Contracts & Commercial",
  },

  // ── Privacy & Data Protection ─────────────────────────────────────────────
  {
    id: "dsar",
    label: "File a DSAR",
    desc: "File a data-subject access request.",
    icon: "◷",
    action: "route",
    prompt: "File a privacy DSAR for a data subject",
    cats: ["Privacy — DPIA / GDPR"],
    category: "Privacy & Data Protection",
    featured: true,
  },
  {
    id: "dpia",
    label: "Start a DPIA",
    desc: "Open a privacy impact assessment for a new processing activity.",
    icon: "◉",
    action: "route",
    prompt: "Start a DPIA / privacy impact assessment for a new data-processing activity",
    cats: ["Privacy — DPIA / GDPR"],
    category: "Privacy & Data Protection",
  },
  {
    id: "dpa-review",
    label: "Review a DPA",
    desc: "Check a data processing agreement for GDPR Article 28 coverage.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this data processing agreement (DPA) for GDPR Article 28 compliance and flag gaps: ",
    cats: ["Privacy — DPIA / GDPR"],
    category: "Privacy & Data Protection",
  },
  {
    id: "breach-response",
    label: "Breach response",
    desc: "Assess notification obligations and next steps for a data incident.",
    icon: "⚑",
    action: "prefill",
    prompt: "Assess breach-notification obligations, timelines, and next steps for a personal-data incident involving: ",
    cats: ["Privacy — DPIA / GDPR"],
    category: "Privacy & Data Protection",
  },
  {
    id: "privacy-notice",
    label: "Draft privacy notice",
    desc: "Draft a privacy-notice section on the canvas.",
    icon: "✎",
    action: "prefill",
    prompt: "Draft a privacy notice section covering: ",
    cats: [],
    category: "Privacy & Data Protection",
  },

  // ── Compliance & Sanctions ────────────────────────────────────────────────
  {
    id: "sanctions-screen",
    label: "Sanctions / OFAC screen",
    desc: "Screen a counterparty for sanctions / OFAC exposure.",
    icon: "◎",
    action: "route",
    prompt: "Screen this counterparty for sanctions and OFAC exposure",
    cats: ["Compliance — Sanctions"],
    category: "Compliance & Sanctions",
    featured: true,
  },
  {
    id: "vendor-dd",
    label: "Vendor due diligence",
    desc: "Run diligence on a new vendor, including sanctions + jurisdiction risk.",
    icon: "◎",
    action: "route",
    prompt: "Run due diligence on a new vendor, including sanctions, jurisdiction, and data-protection risk",
    cats: ["Vendor DD"],
    category: "Compliance & Sanctions",
  },
  {
    id: "eu-ai-act",
    label: "EU AI Act readiness",
    desc: "Assess EU AI Act obligations and likely risk tier for an AI system.",
    icon: "⬡",
    action: "research",
    prompt: "Assess our EU AI Act obligations and likely risk tier for an AI system we are deploying, citing our documents where relevant",
    cats: [],
    category: "Compliance & Sanctions",
  },
  {
    id: "dora-resilience",
    label: "DORA resilience",
    desc: "Summarize DORA operational-resilience obligations and gaps.",
    icon: "⬡",
    action: "research",
    prompt: "Summarize our DORA operational-resilience obligations and gaps for a critical ICT third-party provider",
    cats: [],
    category: "Compliance & Sanctions",
  },
  {
    id: "policy-qa",
    label: "Ask a policy",
    desc: "Ask what an internal policy says, answered from our documents.",
    icon: "🔎",
    action: "prefill",
    prompt: "What does our internal policy say about ",
    cats: [],
    category: "Compliance & Sanctions",
  },

  // ── Litigation & Disputes ─────────────────────────────────────────────────
  {
    id: "legal-hold",
    label: "Legal hold",
    desc: "Open a preservation hold on a matter.",
    icon: "⚖",
    action: "route",
    prompt: "Start a legal hold on the matter",
    cats: ["Litigation — Non-Court"],
    category: "Litigation & Disputes",
    featured: true,
  },
  {
    id: "open-matter",
    label: "Open a matter",
    desc: "Open a new litigation / dispute matter.",
    icon: "◫",
    action: "prefill",
    prompt: "Open a new litigation matter for a dispute with ",
    cats: ["Litigation — Non-Court"],
    category: "Litigation & Disputes",
  },
  {
    id: "demand-letter",
    label: "Demand-letter triage",
    desc: "Triage a received demand letter: urgency, deadlines, preservation.",
    icon: "⚑",
    action: "prefill",
    prompt: "We received a demand letter — triage the urgency, response deadlines, and preservation obligations: ",
    cats: ["Litigation — Non-Court"],
    category: "Litigation & Disputes",
  },
  {
    id: "chronology",
    label: "Build a chronology",
    desc: "Assemble a dated chronology of events from our documents.",
    icon: "🔎",
    action: "research",
    prompt: "Build a dated chronology of the key events for this matter from our documents, with citations",
    cats: [],
    category: "Litigation & Disputes",
  },
  {
    id: "ediscovery",
    label: "eDiscovery review set",
    desc: "Start an eDiscovery review set for a matter's custodians.",
    icon: "⛁",
    action: "prefill",
    prompt: "Start an eDiscovery review set for the matter covering custodians: ",
    cats: [],
    category: "Litigation & Disputes",
  },

  // ── Employment ────────────────────────────────────────────────────────────
  {
    id: "employment-intake",
    label: "Employment matter",
    desc: "File a sensitive employment matter (grievance, dismissal, investigation).",
    icon: "⚑",
    action: "prefill",
    prompt: "File an employment matter (e.g. grievance, dismissal, or workplace investigation): ",
    cats: ["Employment — Sensitive"],
    category: "Employment",
  },
  {
    id: "settlement-review",
    label: "Settlement review",
    desc: "Review a settlement / severance agreement for risk and enforceability.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this settlement / severance agreement for risk, enforceability, and missing protections: ",
    cats: ["Employment — Sensitive"],
    category: "Employment",
  },

  // ── IP & Trademarks ───────────────────────────────────────────────────────
  {
    id: "trademark-clearance",
    label: "Trademark clearance",
    desc: "Screen a proposed brand / trademark name for clearance.",
    icon: "™",
    action: "prefill",
    prompt: "Screen a proposed brand/trademark name for clearance and conflicts: ",
    cats: ["IP / Trademark / OSS"],
    category: "IP & Trademarks",
  },
  {
    id: "ip-assignment",
    label: "IP assignment review",
    desc: "Review an IP assignment / transfer for scope and consideration.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this IP assignment/transfer agreement and confirm the scope of rights, consideration, and warranties: ",
    cats: ["IP / Trademark / OSS"],
    category: "IP & Trademarks",
  },

  // ── Legal Spend ───────────────────────────────────────────────────────────
  {
    id: "invoice-review",
    label: "Invoice review",
    desc: "Review an outside-counsel invoice against budget and guidelines.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this outside-counsel invoice against the matter budget and our billing guidelines: ",
    cats: [],
    category: "Legal Spend",
  },
  {
    id: "spend-summary",
    label: "Spend summary",
    desc: "See legal spend this quarter by matter and vendor.",
    icon: "◴",
    action: "route",
    prompt: "How much legal spend do we have this quarter, by matter and vendor, and how much budget is left?",
    cats: [],
    category: "Legal Spend",
  },

  // ── Governance & Regulatory ───────────────────────────────────────────────
  {
    id: "reg-obligation",
    label: "Flag an obligation",
    desc: "Flag a new regulatory obligation and route it for an owner.",
    icon: "§",
    action: "prefill",
    prompt: "Flag a new regulatory obligation and route it for owner assignment: ",
    cats: ["Regulatory — EU"],
    category: "Governance & Regulatory",
  },
  {
    id: "governance-attest",
    label: "Governance attestation",
    desc: "Prepare a governance / committee attestation.",
    icon: "✎",
    action: "prefill",
    prompt: "Prepare a governance / committee attestation for: ",
    cats: [],
    category: "Governance & Regulatory",
  },

  // ── Research & Drafting ───────────────────────────────────────────────────
  {
    id: "corpus-research",
    label: "Research the corpus",
    desc: "Multi-step research across your documents, with citations.",
    icon: "🔎",
    action: "research",
    prompt: "Summarize the key risks and obligations across our documents",
    cats: [],
    category: "Research & Drafting",
    featured: true,
  },
  {
    id: "summarize-doc",
    label: "Summarize a document",
    desc: "Summarize a document and pull key dates, parties, and obligations.",
    icon: "▤",
    action: "prefill",
    prompt: "Summarize this document and extract the key dates, parties, and obligations: ",
    cats: [],
    category: "Research & Drafting",
  },
  {
    id: "memo",
    label: "Draft a memo",
    desc: "Open the canvas on a memo you can edit and save.",
    icon: "▤",
    action: "prefill",
    prompt: "Draft a memo summarizing ",
    cats: [],
    category: "Research & Drafting",
    featured: true,
  },
  {
    id: "legal-notice",
    label: "Draft a legal notice",
    desc: "Draft a formal legal notice or letter on the canvas.",
    icon: "✎",
    action: "prefill",
    prompt: "Draft a formal legal notice regarding ",
    cats: [],
    category: "Research & Drafting",
  },
];
