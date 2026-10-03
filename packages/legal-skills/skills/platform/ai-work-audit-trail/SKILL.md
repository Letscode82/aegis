---
name: platform-ai-work-audit-trail
description: >-
  Assesses or designs the audit trail for AI-assisted legal work so every AI-influenced action is reconstructable
  and defensible: what prompt/model/inputs produced a recommendation, who approved it, what mutation followed, and
  the chain-sealed record linking them. Use to review whether an AI workflow is auditable, or to design the
  decision-record for a new AI surface. Not for the generic security-framework mapping → regulatory/security-frameworks;
  not for screening untrusted input → platform/prompt-injection-guard.
module: platform
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: workflow
    required: true
    description: The AI-assisted workflow under review or design — what the AI recommends, who approves, and what state change (if any) follows.
  - name: mode
    required: false
    description: One of audit (assess an existing workflow's trail) or design (specify the decision-record for a new one). Defaults to audit.
  - name: current_record
    required: false
    description: What is captured today — prompt/model/version, inputs, confidence, approver identity, approval status, resulting mutation, and whether the record is tamper-evident.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [platform/skill-security-audit, platform/prompt-injection-guard, regulatory/security-frameworks, regulatory/ai-governance, platform/ai-use-billing-record]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# AI-Assisted Work Audit Trail

Checks (or designs) whether an AI-assisted legal action can be reconstructed and defended after the fact: the inputs and model behind a recommendation, the human who approved it, the mutation that followed, and a tamper-evident link between them. The deliverable is an auditability assessment or a decision-record spec, tied to the human-approval-gate invariant — not a logging wish-list.

## When to use / not use

- Use: reviewing whether an AI workflow produces a defensible record; designing the decision-record and audit events for a new AI surface; preparing to answer "show me exactly what the AI did and who signed off" for a regulator, court or client.
- Hand off: the broader security-control review → `platform/skill-security-audit`; the ISO/SOC2/regime mapping → `regulatory/security-frameworks`; screening untrusted inputs → `platform/prompt-injection-guard`; the AI-governance policy framing → `regulatory/ai-governance`; time/cost capture for billing → `platform/ai-use-billing-record`.

## Inputs to collect first

1. The workflow: what the AI produces, whether a human approves, and what state change follows.
2. What is recorded today: prompt/model/version, inputs (and their provenance), confidence/degrade status, approver identity, approval decision, resulting mutation id, timestamps.
3. Whether the record is tamper-evident (append-only, hash-chained) or merely a log that can be edited.
4. Who needs to read the trail later (internal audit, regulator, court, client) and to what evidentiary standard.

## Method

1. **Anchor on the governance invariant.** Every AI action that mutates state requires a human approval and a chain-sealed audit entry; the AI recommends, a human approves, the system acts. The audit trail's job is to *prove* that sequence happened for every action. If the workflow can mutate without a recorded human approval, that is the finding — stop and flag S1.
2. **Trace one action end to end.** Pick a representative AI-influenced action and reconstruct it from the record alone: inputs → prompt/model/version → recommendation (+ confidence / degrade path) → the PENDING decision → the human approve/reject (who, when) → the mutation → the sealed audit row. Every missing link is a gap.
3. **Check input provenance.** The record should show what data the recommendation was based on, including whether any untrusted content was involved, so a later reader can judge reliability and rule out injection.
4. **Check the model/prompt capture.** Model id/version and the prompt (or a hash of it) must be recorded — "the AI said so" is not defensible without knowing which AI, on what instruction, at what time.
5. **Check the approval record.** The approver's identity, the decision (approved / approved-with-override / rejected), the timestamp, and — critically — that approval could only move the decision off PENDING via a real human keystroke, never auto-approved by the model or by injected content.
6. **Check the link to the mutation.** The resulting state change must be tied back to the approved decision (a resulting-audit-log / mutation id), so the action and its authorisation are inseparable in the record.
7. **Check tamper-evidence.** The trail should be append-only and tamper-evident (hash-chained, with corrective rows rather than edits/deletes). A trail that can be silently edited is not evidence. Note that the audit write should not be best-effort where the record *is* the legal anchor — the mutation should fail if the seal fails.
8. **Check the degrade path is on the record.** When the model is unavailable and a deterministic fallback runs, the record must say so — a degraded recommendation must be distinguishable from a model-backed one.
9. **Check retention and retrievability.** The trail must survive long enough and be queryable by action, actor, resource and time — an unqueryable archive is not an audit trail.
10. **Score against the Checks table** and set a decision: **DEFENSIBLE / DEFENSIBLE WITH GAPS / NOT DEFENSIBLE**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| AI can mutate state without a recorded human approval | Every mutation gated by a recorded human approve | S1 | Add the gate + record; this is the moat |
| No model/prompt/version captured | Model id + prompt (or hash) on every recommendation | S1 | Record them; "the AI said so" is not defensible |
| Approval not tied to the mutation | Mutation links to the approved decision id | S1 | Add the resulting-mutation link |
| Trail editable / not tamper-evident | Append-only + hash-chained; corrective rows only | S1 | Make it tamper-evident; no edits/deletes |
| Approver identity/decision/timestamp missing | Who + decision + when, per action | S2 | Capture the full approval record |
| Input provenance absent | Inputs (+ untrusted-content flag) recorded | S2 | Record provenance; enable injection ruling-out |
| Degraded (fallback) runs indistinguishable from model-backed | Degrade path flagged on the record | S2 | Mark degraded recommendations |
| Audit write is best-effort where it is the legal anchor | Seal failure fails the mutation | S2 | Make the seal blocking for anchor actions |
| Trail not queryable by action/actor/resource/time | Indexed, retrievable, retained | S3 | Add query + retention |

## Output

Lead with `Status: DEFENSIBLE | DEFENSIBLE WITH GAPS | NOT DEFENSIBLE — <workflow> — <key reason>`. Then the output contract. Add:

- **End-to-end trace**: the representative action reconstructed from the record, with each link present/missing.
- **Record spec** (design mode): the fields and events every AI action must emit.
- **Gap list** ranked, with the fix and whether it blocks defensibility. One JSON finding per gap with `category: "ai-audit-trail"`.

## Edge cases & pitfalls

- **Logging ≠ audit trail**: application logs that can be rotated, edited or lost are not evidence; the trail must be tamper-evident and tied to the mutation.
- **Best-effort audit on an anchor action**: if the audit row *is* the legal anchor, a swallowed write failure means an unprovable action — make the seal blocking there.
- **Auto-approval creep**: a "confidence high enough to skip review" shortcut breaks the invariant; configuration can set *what* the AI does, never remove the human gate.
- **Prompt not captured**: without the prompt/version, you cannot explain or reproduce a recommendation — a hash at minimum.
- **Degraded output passed off as model output**: the fallback path must be visible, or a reader over-trusts a deterministic guess.

## References

- Volatile facts: cite live where an AI-governance recordkeeping duty is load-bearing (e.g. EU AI Act logging for high-risk systems); mark `[verify current]`.
- AEGIS's chain-sealed `AuditLog` + `AgentDecision` human-approval contract (the governing pattern); EU AI Act record-keeping expectations for high-risk AI as a framing.
