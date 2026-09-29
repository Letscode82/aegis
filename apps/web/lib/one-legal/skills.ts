/**
 * ONE Legal skills (E1) — reusable legal-ops playbooks.
 *
 * A "skill" is a curated, one-click starting action: it carries a structured
 * prompt (the playbook) and how to run it. Invoking a skill routes through the
 * SAME governed console pipeline as anything the user types — so a skill that
 * maps to a mutation still goes propose → human Approve → AgentDecision → act.
 * Skills add no new capability or gate; they make the good paths one click away
 * and surface them persistently in the rail's Skills section + the landing.
 *
 * `action` picks the dispatcher in CommandConsole:
 *   - "route"    → startTurn(prompt)     (intent router: ask / file / tool / compound)
 *   - "research" → startResearch(prompt) (the A1 read-only agent loop)
 *   - "prefill"  → drop the prompt in the composer for the user to complete
 * `cats` are the intake categories the skill covers — used only to highlight
 * the skill that matches the most recent routed request.
 *
 * v1 ships a built-in registry. A later E1.x can persist org-authored skills
 * (a Skill table + admin CRUD) behind this same shape.
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
}

export const SKILLS: OneLegalSkill[] = [
  {
    id: "nda-draft",
    label: "NDA auto-draft",
    desc: "Draft a standard mutual NDA from the playbook.",
    icon: "✎",
    action: "route",
    prompt: "Draft a standard mutual NDA",
    cats: ["NDA — Standard"],
  },
  {
    id: "contract-review",
    label: "Contract review",
    desc: "Flag risks and deviations in a third-party contract.",
    icon: "⇤",
    action: "prefill",
    prompt: "Review this third-party contract for risks and deviations: ",
    cats: ["Vendor Contract"],
  },
  {
    id: "legal-hold",
    label: "Legal hold",
    desc: "Open a preservation hold on a matter.",
    icon: "⚖",
    action: "route",
    prompt: "Start a legal hold on the matter",
    cats: ["Litigation — Non-Court"],
  },
  {
    id: "sanctions-screen",
    label: "Sanctions screen",
    desc: "Screen a counterparty for sanctions / OFAC exposure.",
    icon: "◎",
    action: "route",
    prompt: "Screen this counterparty for sanctions and OFAC exposure",
    cats: ["Compliance — Sanctions"],
  },
  {
    id: "dsar",
    label: "Privacy / DSAR",
    desc: "File a data-subject access request.",
    icon: "◷",
    action: "route",
    prompt: "File a privacy DSAR for a data subject",
    cats: ["Privacy — DPIA / GDPR"],
  },
  {
    id: "corpus-research",
    label: "Research the corpus",
    desc: "Multi-step research across your documents, with citations.",
    icon: "🔎",
    action: "research",
    prompt: "Summarize the key risks and obligations across our documents",
    cats: [],
  },
  {
    id: "memo",
    label: "Draft a memo",
    desc: "Open the canvas on a memo you can edit and save.",
    icon: "▤",
    action: "prefill",
    prompt: "Draft a memo summarizing ",
    cats: [],
  },
];
