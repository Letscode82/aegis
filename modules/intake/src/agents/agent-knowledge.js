// ── Agent knowledge sources (the "what playbook is this agent reading,
//    and can I edit it?" map) ─────────────────────────────────────────
//
// AGENT_PROFILES stamps each agent with a playbook id/version. This map
// answers the next question a GC or legal-ops admin asks: *where does
// that playbook content actually live, and can I change it without a
// code deploy?* Three editability tiers:
//
//   "db"      — the agent reads live rows from Postgres through a module
//               surface. Editable in-product, today, by an authorized
//               user. `where` points at the screen; no deploy needed.
//   "system"  — sourced from a governed system feed (e.g. sanctions
//               lists). Not hand-editable by design — integrity comes
//               from the feed, not an editor.
//   "code"    — the knowledge is a curated corpus in the repo. Editing
//               it is a reviewed code change (that review IS the
//               governance control for these agents today). The
//               `promote` note names the oKF/DB migration that would
//               make it editable in-product.
//
// Keep the keys aligned with AGENT_PROFILES / the agent registry ids.

export const AGENT_KNOWLEDGE = {
  "nda-agent": {
    tier: "db",
    source: "Approved NDA template body (mutual / one-way variants).",
    where: { label: "Contracts → 📄 Templates", href: "/?view=contracts", surface: "templates" },
    detail:
      "The agent renders the active NDA Template row at run time. Edit the clause text or swap the default variant in the Template store and the next request picks it up — no deploy.",
  },
  "contract-review-agent": {
    tier: "db",
    source: "Risk-term checklist + fallback positions from the clause library.",
    where: { label: "Contracts → 📖 Playbook", href: "/?view=contracts", surface: "playbook" },
    detail:
      "The generalist reviewer reads the active ClauseLibrary entries (cap %, indemnity, term, governing law…) as its playbook. Add or re-word an entry in 📖 Playbook and the reviewer applies it immediately.",
  },
  "contract-specialist-agent": {
    tier: "code",
    source: "Per-contract-type playbook catalog (MSA, DPA, SaaS, supply…).",
    where: { label: "contract-playbooks.js", surface: "code" },
    detail:
      "One playbook per contract type selects which standard the review runs against. Curated in the repo today.",
    promote:
      "oKF: becomes a KnowledgePack with a cohort per contract type — same catalog, editable in-product.",
  },
  "vendor-intake-agent": {
    tier: "system",
    source: "Sanctions / denied-party screening lists (OFAC & configured regimes).",
    where: { label: "Governed list feed", surface: "system" },
    detail:
      "Screening runs against the governed SanctionsListEntry set, refreshed on its own cadence. Not hand-editable — integrity is the point.",
  },
  "trademark-agent": {
    tier: "code",
    source: "Preliminary clearance heuristics (phonetic / visual / NICE class).",
    where: { label: "trademark.js", surface: "code" },
    detail:
      "A first-pass heuristic, explicitly NOT a registry search. Real USPTO/EUIPO/WIPO integration is the productionizing step.",
  },
  "notice-mgmt-agent": {
    tier: "code",
    source: "Notice taxonomy + deadline-computation rules.",
    where: { label: "notice-dates.js", surface: "code" },
    detail:
      "The classification taxonomy and cure/response-period math are curated in the repo. Every computed deadline is still human-verified against the source.",
  },
  "privacy-assessment-agent": {
    tier: "code",
    source: "Privacy-triage signal set (special categories, transfer triggers, DPIA thresholds).",
    where: { label: "privacy-signals.js", surface: "code" },
    detail: "Triage thresholds curated in the repo; scheduled legal review keeps them current.",
    promote: "oKF: becomes a RULE-kind KnowledgePack, editable by the privacy owner.",
  },
  "marketing-review-agent": {
    tier: "code",
    source: "Approved-claims library + substantiation flags.",
    where: { label: "claims-signals.js", surface: "code" },
    detail: "Seed claims library curated in the repo. Fast-track safety depends on purging expired substantiation.",
    promote: "oKF: becomes a CLAUSE/RULE KnowledgePack so claims + substantiation are managed in-product.",
  },
  "faq-agent": {
    tier: "code",
    source: "Curated approved-answers knowledge base.",
    where: { label: "kb.js", surface: "code" },
    detail: "Approved Q&A entries curated in the repo; each answer's currency is only as good as its last review.",
    promote: "oKF: becomes a QA-kind KnowledgePack, editable by knowledge owners.",
  },
  "policy-qa-agent": {
    tier: "code",
    source: "Internal policy corpus (single-current-version).",
    where: { label: "policy-library.js", surface: "code" },
    detail: "Policy text curated in the repo; single-current-version hygiene is a prerequisite for correct citations.",
    promote: "oKF: becomes a REFERENCE-kind KnowledgePack sourced from the live policy store.",
  },
  "litigation-agent": {
    tier: "code",
    source: "Case-brief structure (non-court-facing evidence index).",
    where: { label: "litigation.js", surface: "code" },
    detail: "Brief scaffolding curated in the repo. The brief is an evidence index, not a theory of the case.",
  },
};

const TIER_META = {
  db: { label: "EDITABLE NOW", color: "gn", icon: "✎" },
  system: { label: "GOVERNED FEED", color: "bl", icon: "◈" },
  code: { label: "IN CODE", color: "t3", icon: "⌘" },
};

export function knowledgeFor(agentId) {
  return AGENT_KNOWLEDGE[agentId] || null;
}

export function tierMeta(tier) {
  return TIER_META[tier] || TIER_META.code;
}
