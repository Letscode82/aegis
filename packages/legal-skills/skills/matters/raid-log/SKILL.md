---
name: matters-raid-log
description: >-
  Builds and maintains a RAID log for a matter — Risks, Assumptions, Issues and Decisions — extracted from
  correspondence, meetings and documents, each with an owner, status, severity/likelihood and the action or date that
  moves it. Use to turn scattered email/meeting threads into a single tracked control surface for a matter, or to keep
  one current. Not for the full matter plan and critical path → matters/matter-plan; not for the end-of-matter
  retrospective → matters/lessons-learned.
module: matters
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of build (create a RAID log from source material), update (merge new correspondence into an existing log) or review (assess an existing log for gaps/stale items).
  - name: sources
    required: false
    description: The correspondence, meeting notes, status updates or documents to extract RAID items from, plus any existing RAID log to update.
  - name: matter
    required: false
    description: The matter, its objective and key dates, and who the owners/stakeholders are so items can be assigned.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [matters/matter-plan, matters/lessons-learned, matters/legal-kpi-dashboard, disputes/early-case-assessment, outside-counsel/matter-budget]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# RAID Log

Turns the stream of emails, calls and documents on a matter into one disciplined control surface: **R**isks (might happen), **A**ssumptions (taken as true, unverified), **I**ssues (happening now), **D**ecisions (made, with rationale) — each owned, dated and status-tracked. The deliverable is a current, de-duplicated RAID table that tells the team what to act on, not a transcript of the thread.

## When to use / not use

- Use: standing up a tracker for a live matter; distilling a long correspondence/meeting history into tracked items; keeping a RAID log current as new material arrives; auditing an existing log for stale or owner-less items.
- Hand off: the full work plan, tasks and critical path → `matters/matter-plan`; the closed-matter retrospective → `matters/lessons-learned`; portfolio-level metrics/reporting → `matters/legal-kpi-dashboard`; the substantive merits/strategy of a dispute → `disputes/early-case-assessment`; the spend/forecast view → `outside-counsel/matter-budget`.

## Inputs to collect first

1. The source material (emails, notes, documents) and any existing RAID log to extend.
2. The matter's objective and key dates — so risks/issues can be tied to what they threaten.
3. The owners/stakeholders available to assign items to.

## Method

1. **Classify every item into exactly one bucket.**
   - **Risk** — a *future* uncertain event that would have an impact (has a likelihood).
   - **Assumption** — something taken as true but **not yet verified**; it converts to a risk or issue if wrong.
   - **Issue** — something that *has happened or is live now* and needs action.
   - **Decision** — a choice made, with who made it, when, and the rationale.
   Mis-bucketing (a live problem logged as a "risk") is the classic RAID error — if it's happening, it's an Issue.
2. **Extract from the source, don't invent.** Pull items from what the correspondence actually says; attribute each to its source (date/sender) so it's traceable.
3. **Give each item the mandatory fields.** ID, description, owner, status (open/in-progress/closed), date raised, and the next action + due date. An item with no owner and no next step is noise.
4. **Score risks and issues.** Risks get **likelihood × impact** (use the S1–S4 impact scale); issues get a severity. This drives the order of attention.
5. **State the mitigation / action.** For each risk, the mitigation or contingency; for each issue, the resolution action and owner; for each assumption, how/when it will be verified.
6. **Record decisions with rationale.** Capture the decision, the decider, the date, and *why* — a decision log without rationale can't be defended or revisited sensibly later.
7. **De-duplicate and merge on update.** When new correspondence repeats an item, update the existing row (status/next action) rather than adding a duplicate; close items that are resolved with a closing note.
8. **Sweep for staleness.** Flag open items with no movement past their due date, owner-less items, and assumptions that are now overdue for verification.
9. **Score against the Checks table** and present the log ordered by severity/likelihood with the top actions surfaced.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Item mis-bucketed (live problem as a "risk") | R/A/I/D definitions applied correctly | S2 | Re-classify; a live problem is an Issue |
| Item with no owner | Every open item has a named owner | S2 | Assign an owner |
| No next action / due date | Each open item has an action + date | S2 | Add the action and date |
| Risk unscored | Likelihood × impact assigned | S3 | Score it on the S1–S4 scale |
| Assumption never scheduled for verification | Verification step + date set | S3 | Add how/when it's checked |
| Decision logged without rationale/decider | Who · when · why captured | S2 | Record the rationale |
| Duplicates across updates | Items merged, not re-added | S3 | De-dupe into the existing row |
| Stale open items unflagged | Overdue/no-movement items surfaced | S3 | Flag and chase or close |
| Items invented, not sourced | Each item traces to its source | S2 | Remove or source the item |

## Output

Lead with `RAID: <n open issues / n open risks / n unverified assumptions> — top action: <the single most urgent item>`. Then the output contract. Add:

- **RAID table**: ID · type (R/A/I/D) · description · owner · status · severity/likelihood · next action · due date · source.
- **Top of the pile**: the highest-severity open issues and risks.
- **Decisions log**: decision · decider · date · rationale.
- **Housekeeping**: stale / owner-less / overdue-assumption flags.
- One JSON finding per open high-severity item with `category: "raid"`.

## Edge cases & pitfalls

- **Risk vs issue drift**: a risk that has materialised must be moved to Issues and actioned — leaving it as a "risk" hides a live problem.
- **Orphan items**: entries with no owner or next step accumulate and the log dies; enforce owner + action on every open item.
- **Silent assumptions**: the most dangerous items are assumptions nobody flagged as unverified — surface and schedule them.
- **Duplicate sprawl**: re-extracting the same thread on each update without merging turns the log into a transcript; always reconcile to the existing rows.
- **Un-sourced items**: a RAID entry no one can trace to a source invites dispute — keep the provenance.

## References

- Volatile facts: generally none; cite `[verify current]` only where a logged risk depends on a dated legal position.
- Standard project/matter-management RAID practice; the matter's own correspondence and the S1–S4 severity scale for impact scoring.
