import { profileFor } from "./agent-profiles";

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
  return {
    agentId,confidence,suggestedAction,draftedResponse,reasoning,
    concerns,precedentLinks,alternativeTone,
    risks:risks!==undefined?risks:(profile?.risks||[]),
    playbook:playbook!==undefined?playbook:(profile?.playbook||null),
    // Agent 9 — SLA sized to the shortest extracted deadline. Applied
    // by the ticket pipeline ONLY when tighter than the current SLA.
    proposedSlaHours,
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
