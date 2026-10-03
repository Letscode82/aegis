---
name: matters-matter-plan
description: >-
  Turns an agreed matter scope into a work plan: phases, workstreams, dependencies, critical path, milestones,
  owners and RACI, and the key risks/decisions along the way. Use to plan a new matter, build a project plan for a
  transaction or dispute, or sequence the work after intake. Not for the cost view → outside-counsel/matter-budget;
  not for scoping the matter itself at intake → intake/matter-scoping.
module: matters
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: matter
    required: true
    description: Matter type, agreed scope and objective, key dates/deadlines, and the parties/teams involved.
  - name: constraints
    required: false
    description: Hard deadlines (court, regulatory, deal), resource limits, and external dependencies (counsel, experts, counterparties).
  - name: known_risks
    required: false
    description: Risks or open decisions already identified that the plan must account for.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [intake/matter-scoping, outside-counsel/matter-budget, matters/raid-log, matters/status-report, matters/stakeholder-comms]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Matter Plan & Critical Path

Converts an agreed scope into a sequenced plan a team can execute: what happens in what order, who owns it, what it depends on, and which dates cannot move. The output is a plan plus the critical path and the risks that threaten it — not a flat task list.

## When to use / not use

- Use: planning a new matter after scope is agreed; building a transaction or litigation project plan; re-planning after a scope change or an adverse event.
- Hand off: scoping the matter at intake (issues, budget, staffing) → `intake/matter-scoping`; the money view → `outside-counsel/matter-budget`; tracking risks/assumptions/issues/decisions as the matter runs → `matters/raid-log`; reporting progress → `matters/status-report`.

## Inputs to collect first

1. Objective and definition of done for the matter.
2. Hard dates: statutory/court deadlines, deal timetable, regulatory windows — mark the non-movable ones.
3. Workstreams and the teams/people who own them (internal and external).
4. Known dependencies on third parties (counsel, experts, counterparties, authorities).
5. Known risks and the decisions that will shape the path.

## Method

1. **Confirm scope and objective** in one line; list explicit out-of-scope items so the plan has edges.
2. **Break into phases and workstreams** appropriate to the type (transaction: diligence/drafting/negotiation/signing/closing; dispute: assessment/pleadings/disclosure/evidence/hearing; investigation: scoping/collection/analysis/reporting).
3. **Sequence and find dependencies**: for each task note what must finish first (finish-to-start) and what can run in parallel. Mark external dependencies distinctly — they are the usual slip points.
4. **Identify the critical path**: the longest chain of dependent tasks that sets the earliest finish. Anchor it to the non-movable dates and work backwards; flag where the path has no slack.
5. **Set milestones and owners**: name a milestone per phase with a date and an owner; assign each workstream a single accountable owner (RACI — one A per task).
6. **Surface risks and decisions**: list what could knock the plan off the critical path and the decisions that gate progress; give each a trigger and an owner (feed `matters/raid-log`).
7. **Build the schedule view**: phases with start/finish, dependencies, milestones, and the critical path highlighted. Add buffer only where uncertainty is real and name what it absorbs.
8. **Score** the plan's executability and set a decision: **APPROVE / APPROVE WITH CONDITIONS / REVISE**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No defined objective / done | One-line objective + out-of-scope list | S2 | Define with the matter owner first |
| Non-movable dates not anchored | Court/regulatory/deal dates marked and planned back from | S1 if a hard deadline is at risk | Re-plan to protect the date |
| Dependencies missing | Each task's predecessors + external dependencies mapped | S2 | Map dependencies; re-sequence |
| No critical path | Longest dependent chain identified and watched | S2 | Compute critical path |
| Owners unassigned / multiple As | One accountable owner per workstream (RACI) | S2 | Assign single owners |
| Milestones vague | Dated, verifiable milestones per phase | S3 | Make milestones testable |
| Risks to the path untracked | Each path risk has a trigger + owner | S3 | Feed `matters/raid-log` |
| No slack where uncertainty is high | Buffer sized to real uncertainty, named | S3 | Add targeted buffer |

## Output

Lead with `Decision: APPROVE | APPROVE WITH CONDITIONS | REVISE — <earliest finish + the binding constraint>`. Then the output contract. Add:

- **Plan table**: phase/task · owner (A) · depends on · start → finish · milestone?
- **Critical path**: the ordered chain and where it has no slack.
- **Risks to the path**: risk · trigger · owner · mitigation.
- One JSON finding per threat to the critical path with `category: "schedule"`.

## Edge cases & pitfalls

- **A date is not a plan**: a deadline with no backward-planned path behind it is the commonest way matters slip — plan back from every hard date.
- **Parallel ≠ free**: parallel workstreams still compete for the same people; check resource clashes, not just logical dependencies.
- **External slip**: counsel, experts and counterparties cause most delay — build their lead times in and track them as dependencies, not assumptions.
- **Plan vs log**: this skill produces the plan; keep the living risk/issue/decision record in `matters/raid-log` so the plan stays stable.

## References

- `matters/raid-log` for live risk/assumption/issue/decision tracking; `matters/status-report` for progress reporting against this plan.
