---
name: disputes-deadline-calendar
description: >-
  Builds a procedural deadline / limitation calendar for a dispute: computes limitation and filing dates, service and
  response windows, appeal and interim-relief clocks, and pre-action steps (incl. India s.12A mediation and s.21
  notice), with a method for counting days and flagging what needs same-day action. Use to map deadlines for a new
  matter, check a date, or build a cause-list tracker. Not for the merits strategy → disputes/early-case-assessment;
  not for drafting the notice itself → disputes/legal-notice-drafter.
module: disputes
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of build (map all deadlines for a matter), check (compute/verify a single date) or audit (review an existing tracker for missed/at-risk dates).
  - name: matter_facts
    required: false
    description: Forum/jurisdiction, cause of action, key trigger dates (breach/accrual, service, order date), and the stage (pre-action, pleadings, appeal).
  - name: today
    required: false
    description: The reference date for the computation (defaults to the run date) so "days remaining" is explicit.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [disputes/legal-notice-drafter, disputes/early-case-assessment, disputes/chronology-builder, disputes/litigation-hold, matters/matter-plan]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Procedural Deadline Calendar

Turns a matter's facts into a dated, prioritised deadline calendar — limitation, pre-action, service/response, interim-relief and appeal clocks — with the counting method shown and the "act today" items at the top. A missed limitation or appeal date is often fatal and uninsurable, so this skill is conservative by design: it flags and escalates rather than quietly computing a single answer. The deliverable is a calendar with reasoning and caveats, not a bare date.

## When to use / not use

- Use: mapping all procedural deadlines when a dispute opens; computing or sanity-checking a single limitation/appeal/response date; auditing a tracker for missed or at-risk dates.
- Hand off: the merits/strategy assessment → `disputes/early-case-assessment`; drafting the pre-action letter or statutory notice → `disputes/legal-notice-drafter`; the fact timeline → `disputes/chronology-builder`; preserving evidence → `disputes/litigation-hold`; the overall matter plan → `matters/matter-plan`.

## Inputs to collect first

1. Forum and governing procedural law (court/tribunal/arbitration; jurisdiction) — the rules differ fundamentally.
2. Cause of action and the limitation trigger (date of breach / accrual / knowledge).
3. The key event dates already known: service, order/judgment date, demand, notice.
4. Current stage (pre-action, pleadings, interim, trial, appeal) and any order fixing dates.
5. The reference "today" so days-remaining is unambiguous.

## Method

1. **State the forum and the applicable rules first.** Deadline math is meaningless without the controlling procedural code — identify it and treat every computed date as subject to the live rule and any court order `[verify current]`.
2. **Compute limitation conservatively.** Identify the trigger (accrual/knowledge/date of cause of action), the limitation period, and any suspension/extension (disability, acknowledgment, fraud/concealment, standstill agreement). Where the trigger is uncertain, compute from the **earliest arguable** trigger and flag the ambiguity — never assume the generous reading.
3. **Map pre-action steps that gate filing.** For India commercial suits: **s.12A pre-institution mediation** (mandatory unless urgent interim relief is sought) and any **s.80 CPC / s.21 notice** periods; for other forums, pre-action protocols. A filing made without a required pre-action step can be struck out.
4. **Lay out the post-commencement clocks**: service windows, time to respond/defend, counterclaim, disclosure/discovery, witness statements, and any order-fixed dates.
5. **Interim-relief timing.** Flag where urgency drives an immediate application (injunction, stay, preservation) and where delay defeats the relief.
6. **Appeal and review clocks** — usually short and strict; compute from the operative date (pronouncement vs receipt of the order, per the rule) and flag which trigger applies.
7. **Count days explicitly and consistently.** State whether the period is clear days / calendar days / working days, whether the trigger day counts, and how weekends/holidays and the forum's vacation roll the date. Show the arithmetic.
8. **Prioritise by jeopardy.** Rank each date: **act today / this week / scheduled**, and mark any date whose miss is fatal (limitation, appeal) as S1 regardless of how far out it is.
9. **For audit mode**, recompute each tracked date and flag missed, at-risk (inside a buffer), or mis-computed entries.
10. **Set a decision**: **ON TRACK / ACTION REQUIRED / AT RISK (dates in jeopardy)** and list the escalations.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Limitation date miscomputed or assumed generously | Earliest arguable trigger + conservative period | S1 | Re-compute from earliest trigger; escalate to counsel |
| Appeal/review window missed or at risk | Operative-date trigger confirmed + buffer | S1 | File protective step now; confirm the rule |
| Mandatory pre-action step skipped (e.g. India s.12A) | Step completed or urgency exception documented | S1 | Complete the step or justify the exception before filing |
| Day-counting method not stated | Clear/calendar/working days + trigger-day rule shown | S2 | State the method; redo the count |
| Interim relief delayed past effectiveness | Urgent application flagged immediately | S2 | Escalate for same-day instruction |
| Holiday/vacation roll not applied | Forum calendar applied to each date | S2 | Adjust dates for non-working days |
| Single date given with no caveat on a fatal clock | Load-bearing dates carry a `[verify current]` + escalate | S2 | Add caveat; have counsel confirm |
| Tracker (audit) has at-risk dates inside buffer | Every date has an owner + reminder | S3 | Assign + set reminders |

## Output

Lead with `Status: ON TRACK | ACTION REQUIRED | AT RISK — <matter> — <key jeopardy>`. Then the output contract. Add:

- **Forum & rules**: the controlling procedural law and any order fixing dates.
- **Deadline table**: item · trigger date · rule/period · computed date · days remaining · counting method · jeopardy (act today / this week / scheduled).
- **Escalations**: the fatal or near-term dates needing instruction now, each with a `[verify current]`.
- One JSON finding per at-risk/missed/ambiguous date with `category: "deadline"`.

## Edge cases & pitfalls

- **Limitation is uninsurable to miss**: when the trigger is arguable, compute from the earliest plausible date and escalate — do not pick the favourable reading.
- **Operative date for appeals**: pronouncement vs receipt of the certified copy changes the window; confirm which the rule uses.
- **s.12A urgency exception**: "urgent interim relief" is read strictly by Indian courts — do not rely on it to skip mediation without a genuine urgency.
- **Working-days vs calendar-days**: mixing these is a classic error; state and apply one consistently per period.
- **Standstill agreements**: a limitation standstill must be in writing and its scope checked — don't assume it covers every claim.
- **This skill does not give the final date**: load-bearing dates must be confirmed by a qualified practitioner against the live rule; mark them `[verify current]`.

## References

- Volatile facts: `IN-COMM-01` (Commercial Courts Act / s.12A), `IN-ARB-01` where arbitration appointment timing is in play. Cite live where a period is load-bearing; mark `[verify current]`.
- The forum's procedural code and limitation statute; India: Limitation Act 1963, CPC (incl. s.80), Commercial Courts Act 2015 s.12A; applicable pre-action protocols.
