import { profileFor } from "./agent-profiles";
import { buildOutputContract, inferSeverity, confidenceLabel } from "@aegis/legal-skills/severity";

// SK-4 — every oKF recommendation ALSO emits the shared AEGIS output contract
// (S1–S4 severity + the JSON shape every @aegis/legal-skills playbook speaks),
// so intake findings roll up on the same Risk Graph as the package's skills.
// This is purely ADDITIVE: the human-approval gate, the Cockpit render, and all
// existing rec fields are unchanged, and nothing here can bypass the harness —
// `outputContract.review.status` is always "draft". Free-text `concerns` become
// findings with a conservatively-inferred severity; `flag-for-review` always
// escalates. Imported from the fs-free `/severity` subpath so this stays safe to
// bundle.
function toOutputContract(agentId, { confidence, suggestedAction, reasoning, concerns = [], playbook }) {
  const conf = confidenceLabel(confidence);
  const findings = (concerns || [])
    .filter((c) => typeof c === "string" && c.trim())
    .map((c, i) => ({ id: `F${i + 1}`, title: c.trim(), severity: inferSeverity(c), analysis: "", recommendation: "", confidence: conf }));
  const forceEscalate = suggestedAction === "flag-for-review";
  const bottomLine = (typeof reasoning === "string" && reasoning.trim())
    ? reasoning.trim().split(/(?<=[.!?])\s/)[0].slice(0, 280)
    : `Agent ${agentId}: ${suggestedAction || "recommendation"}.`;
  const contract = buildOutputContract({
    skill: `okf/${agentId}`,
    skillVersion: (playbook && playbook.version) || null,
    bottomLine,
    findings,
    actions: suggestedAction ? [{ owner: "Reviewing attorney", action: suggestedAction, blocking: forceEscalate }] : [],
    review: { risk_tier: "review-required", status: "draft" },
  });
  if (forceEscalate && !contract.escalation.required) {
    contract.escalation = { required: true, to: "Reviewing attorney", reason: "Flagged for human review" };
  }
  return contract;
}

// Helper for building recommendations uniformly.
//
// GC Suite agent contract (Working Architecture doc): every
// recommendation carries, alongside the draft/reasoning/concerns, the
// approver-facing `risks` checklist ("Risks to weigh before
// approving") and the `playbook` stamp naming the standard + version
// the agent applied. Defaults come from the agent's profile so no
// call site can forget them; explicit fields override.
export function buildRec(agentId,{confidence,suggestedAction,draftedResponse,reasoning,concerns=[],precedentLinks=[],alternativeTone=null,mock=false,risks,playbook,proposedSlaHours=null}){
  const profile=profileFor(agentId);
  const resolvedPlaybook=playbook!==undefined?playbook:(profile?.playbook||null);
  return {
    agentId,confidence,suggestedAction,draftedResponse,reasoning,
    concerns,precedentLinks,alternativeTone,
    risks:risks!==undefined?risks:(profile?.risks||[]),
    playbook:resolvedPlaybook,
    // Agent 9 — SLA sized to the shortest extracted deadline. Applied
    // by the ticket pipeline ONLY when tighter than the current SLA.
    proposedSlaHours,
    // SK-4 — shared severity + JSON output contract (additive; see above).
    outputContract:toOutputContract(agentId,{confidence,suggestedAction,reasoning,concerns,playbook:resolvedPlaybook}),
    generatedAt:Date.now(),mock,
  };
}

// ── Conservative-AI safety invariant ──────────────────────────────────
// When an agent's Claude call fails, it may still surface a template /
// playbook draft so the attorney has a starting point — but it must NEVER
// recommend auto-send. A degraded (non-AI-reviewed) recommendation is
// ALWAYS flagged for human review at low confidence, regardless of what
// the agent's happy-path confidence would have been. This is the single
// chokepoint every agent's catch-block routes through, so the invariant
// can't drift per-agent.
export const DEGRADED_CONFIDENCE=0.4;
export const DEGRADED_ACTION="flag-for-review";
const DEGRADED_LEAD_CONCERN=
  "⚠ AI review unavailable — this is a template draft, not an AI-generated recommendation. Attorney review required before sending.";

export function buildDegradedRec(agentId,fields){
  const concerns=[DEGRADED_LEAD_CONCERN,...(fields.concerns||[])];
  return buildRec(agentId,{
    ...fields,
    concerns,
    confidence:DEGRADED_CONFIDENCE,
    suggestedAction:DEGRADED_ACTION,
    mock:true,
  });
}
