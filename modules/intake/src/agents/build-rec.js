import { profileFor } from "./agent-profiles";
import { normalizeSeverity, rollUpOverall, coerceFindings } from "@aegis/legal-skills/output-contract";

// SK-4 — the AEGIS shared output contract (@aegis/legal-skills) is the single
// source of truth for the output SHAPE. Every recommendation this helper
// builds carries an `overall` severity on the one S1–S4/Info scale plus the
// structured `findings` list when the agent produced one, so findings from the
// eleven intake agents and the skill surfaces are comparable and roll up on the
// Risk Graph. buildRec normalises whatever the caller passes; the chokepoint in
// index.js fills `overall` from the ticket's triage risk when an agent didn't
// assess severity itself.
//
// Parse the leading risk word(s) of an intake triage `riskFlag` prose string
// ("Critical — …", "Low-Medium — …", "None — 100% template match") to a
// severity. Picks the MOST severe word present before the em dash, so a
// "Low-Medium" flag maps to S3 rather than under-rating to S4.
const RISK_WORD_RANK = [
  ["critical", "S1"],
  ["high", "S2"],
  ["medium", "S3"],
  ["low", "S4"],
  ["none", "Info"],
];
export function severityFromTriageRiskFlag(riskFlag) {
  // Split on the em/en dash (or a space-hyphen-space) that separates the risk
  // word from the note — NOT the hyphen inside a compound word like
  // "Low-Medium", so the compound is scanned whole and maps to its worst word.
  const head = String(riskFlag || "").split(/[—–]|\s-\s/)[0].toLowerCase();
  if (!head.trim()) return null;
  for (const [word, sev] of RISK_WORD_RANK) {
    if (head.includes(word)) return sev;
  }
  return null;
}

// Helper for building recommendations uniformly.
//
// GC Suite agent contract (Working Architecture doc): every
// recommendation carries, alongside the draft/reasoning/concerns, the
// approver-facing `risks` checklist ("Risks to weigh before
// approving") and the `playbook` stamp naming the standard + version
// the agent applied. Defaults come from the agent's profile so no
// call site can forget them; explicit fields override.
export function buildRec(agentId,{confidence,suggestedAction,draftedResponse,reasoning,concerns=[],precedentLinks=[],alternativeTone=null,mock=false,risks,playbook,proposedSlaHours=null,overall,findings}){
  const profile=profileFor(agentId);
  // SK-4 — normalise to the shared output contract. An explicit `overall`
  // wins; otherwise roll it up from structured `findings`; otherwise leave it
  // null ("not assessed") for the index.js chokepoint to fill from triage.
  const coercedFindings=coerceFindings(findings);
  const normalizedOverall=overall!==undefined
    ? normalizeSeverity(overall)
    : (coercedFindings.length?rollUpOverall(coercedFindings):null);
  return {
    agentId,confidence,suggestedAction,draftedResponse,reasoning,
    concerns,precedentLinks,alternativeTone,
    risks:risks!==undefined?risks:(profile?.risks||[]),
    playbook:playbook!==undefined?playbook:(profile?.playbook||null),
    // SK-4 — shared output-contract fields (one scale across all agents).
    overall:normalizedOverall,
    findings:coercedFindings,
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
