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
    source: "Risk-term checklist + fallback positions (the clause library).",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail:
      "Runs entirely from its published oKF definition (executionMode: okf). Edit its clauses, prompt, or thresholds in the Designer and Publish — the reviewer applies them on the next request. Also editable via Contracts → 📖 Playbook.",
  },
  "contract-specialist-agent": {
    tier: "db",
    source: "Per-contract-type playbook catalog (MSA, DPA, licensing, supply…).",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "Migrated to the contract-type catalog pack — one playbook per type, each in its own cohort so only the matching type loads. Edit the items in the Knowledge tab.",
  },
  "vendor-intake-agent": {
    tier: "system",
    source: "Sanctions / denied-party screening lists (OFAC & configured regimes).",
    where: { label: "Governed list feed", surface: "system" },
    detail:
      "Screening runs against the governed SanctionsListEntry set, refreshed on its own cadence — not hand-editable (integrity is the point). The screening posture / rules ARE editable RULE items in the Agent Designer.",
  },
  "trademark-agent": {
    tier: "db",
    source: "Preliminary clearance heuristics (phonetic / visual / NICE class).",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "The heuristic rules are editable RULE items. Still NOT a registry search — real USPTO/EUIPO/WIPO integration is the productionizing step.",
  },
  "notice-mgmt-agent": {
    tier: "db",
    source: "Notice taxonomy + deadline rules.",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "The classification taxonomy is editable RULE items; the deadline math stays in code and every computed date is human-verified.",
  },
  "privacy-assessment-agent": {
    tier: "db",
    source: "Privacy-triage signals (special categories, transfer triggers, DPIA thresholds).",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "The triage thresholds are editable RULE items; the deterministic detection runs in code.",
  },
  "marketing-review-agent": {
    tier: "db",
    source: "Approved-claims library + substantiation rules.",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "Approved claims + the substantiation rules are editable items; the deterministic claim scan runs in code.",
  },
  "faq-agent": {
    tier: "db",
    source: "Curated approved-answers knowledge base.",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "The full KB is editable QA items in the Knowledge tab — add or re-word an answer and the agent applies it.",
  },
  "policy-qa-agent": {
    tier: "db",
    source: "Internal policy corpus (single-current-version).",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "The policy corpus is editable QA items; keep one current version per policy for correct citations.",
  },
  "litigation-agent": {
    tier: "db",
    source: "Case-brief structure (non-court-facing evidence index).",
    where: { label: "Agent Designer → Knowledge", surface: "designer" },
    detail: "The brief scaffolding is editable REFERENCE items. The brief is an evidence index, not a theory of the case.",
  },
};

const TIER_META = {
  db: { label: "EDITABLE IN DESIGNER", color: "gn", icon: "✎" },
  system: { label: "GOVERNED FEED", color: "bl", icon: "◈" },
  code: { label: "IN CODE", color: "t3", icon: "⌘" },
};

export function knowledgeFor(agentId) {
  return AGENT_KNOWLEDGE[agentId] || null;
}

export function tierMeta(tier) {
  return TIER_META[tier] || TIER_META.code;
}
