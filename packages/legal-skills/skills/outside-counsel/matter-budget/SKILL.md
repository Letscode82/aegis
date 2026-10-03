---
name: outside-counsel-matter-budget
description: >-
  Builds a phase-based budget and fee forecast for a legal matter and tracks burn against it: phase breakdown,
  fee-arrangement choice, assumptions and contingencies, approval thresholds, and a variance / early-warning view.
  Use to scope a budget for a new matter or outside-counsel engagement, pressure-test a firm's estimate, or set up
  burn tracking. Not for reviewing an invoice against the budget → outside-counsel/invoice-review; not for the
  matter's work plan → matters/matter-plan.
module: outside-counsel
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of build (new budget), review (pressure-test a firm's estimate) or track (burn vs budget from time/invoice data).
  - name: matter
    required: true
    description: Matter type, scope, complexity, likely duration, jurisdiction(s), and the outcome sought.
  - name: fee_context
    required: false
    description: Rate card or proposed fee arrangement, any budget ceiling, and prior comparable matters.
  - name: actuals
    required: false
    description: For track mode — fees billed/accrued to date by phase.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [outside-counsel/invoice-review, outside-counsel/fee-arrangements, outside-counsel/billing-guidelines, matters/matter-plan, matters/legal-kpi-dashboard]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Matter Budget & Forecast

Turns a matter's scope into a defensible phase budget, picks the fee arrangement that fits the risk, and sets up the burn-tracking that catches an overrun while there is still time to act. The output is a budget a GC can approve and hold counsel to.

## When to use / not use

- Use: scoping spend for a new matter; setting an outside-counsel budget before instructing; pressure-testing a firm's estimate; building the burn tracker for a live matter.
- Hand off: an invoice to check against guidelines/budget → `outside-counsel/invoice-review`; choosing between hourly / fixed / capped / success fees in depth → `outside-counsel/fee-arrangements`; the substantive work plan and critical path → `matters/matter-plan`.

## Inputs to collect first

1. Matter type, scope boundaries, and the outcome sought (settle, defend, close, file).
2. Complexity drivers: parties, jurisdictions, document volume, novelty, urgency.
3. Likely phases and duration, and the key decision points that could change scope.
4. Rate card / proposed fee arrangement and any approved ceiling.
5. Comparable prior matters, if any, for calibration.

## Method

1. **Phase the matter** using a standard task-based structure (adapt to type). Litigation example: assessment → pleadings → discovery/disclosure → motions → expert → pre-trial → trial → appeal. Transaction example: structuring → diligence → drafting → negotiation → signing → closing → post-closing.
2. **Estimate each phase** bottom-up: tasks × staffing mix × hours × rate, or a fixed/capped figure where the phase is predictable. State the staffing leverage (partner/associate/paralegal split) — over-weighted senior time is the most common overrun.
3. **Choose the fee arrangement per phase**: hourly where scope is uncertain, fixed/capped where it is predictable, success/contingency where interests align and it is permitted. Flag any arrangement that needs a conflict or ethics check `[verify current]`.
4. **Add assumptions and contingency**: list the assumptions each number depends on (no appeal, ≤N custodians, one round of negotiation) and a contingency line sized to the uncertainty, not a flat percentage applied blindly.
5. **Set approval thresholds and triggers**: the ceiling, the per-phase caps, and the events that require a re-forecast (scope change, new party, adverse ruling).
6. **Build the tracker** (track mode): compare actuals to phase budget, compute % burn and projected outturn, and raise an early-warning when a phase crosses a threshold (e.g. 80% burn before the phase is 80% done).
7. **Score** the budget's soundness and set a decision: **APPROVE / APPROVE WITH CONDITIONS / REVISE**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No phase breakdown | Task-based phases with per-phase figures | S2 | Rebuild bottom-up |
| Assumptions unstated | Every number tied to a named assumption | S2 | List assumptions; re-estimate exposed lines |
| Staffing leverage wrong | Junior-weighted where appropriate; senior time justified | S3 | Re-mix staffing; renegotiate |
| Fee arrangement mismatched to risk | Fixed/capped where predictable; hourly where not | S3 | Switch arrangement per phase |
| No contingency / blanket % | Contingency sized to real uncertainty | S3 | Right-size contingency |
| No ceiling or re-forecast triggers | Ceiling + events that force re-forecast | S2 | Add thresholds and triggers |
| No burn tracking | Actuals vs budget with early warning | S2 (track mode) | Stand up tracker |
| Scope creep unmanaged | Change-control: new scope = new estimate + approval | S2 | Add change-control step |

## Output

Lead with `Decision: APPROVE | APPROVE WITH CONDITIONS | REVISE — <headline number + confidence>`. Then the output contract. Add:

- **Budget table**: phase · scope · fee basis · estimate · assumptions.
- **Totals**: base, contingency, ceiling; staffing leverage summary.
- Track mode: phase · budget · actual · % burn · projected outturn · status (🟢/🟡/🔴).
- One JSON finding per material risk or overrun with `category: "budget"`.

## Edge cases & pitfalls

- **False precision**: a tidy number with no assumptions is less useful than a range with stated drivers — show the range.
- **Contingency as a slush fund**: contingency covers *identified* uncertainty, not scope you forgot to price.
- **Phase blending**: firms that bill across phases hide overruns — require phase codes in billing guidelines so the tracker works.
- **The 80/80 rule**: 80% of budget burned before 80% of the phase is done is the earliest reliable overrun signal — wire it into the tracker.

## References

- `outside-counsel/billing-guidelines` for the billing codes the tracker depends on; `outside-counsel/fee-arrangements` for arrangement selection.
