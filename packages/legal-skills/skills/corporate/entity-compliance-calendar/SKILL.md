---
name: corporate-entity-compliance-calendar
description: >-
  Builds a statutory compliance calendar for a company: the periodic filings, registers, meetings and returns each
  entity must make (in India MCA/ROC annual filings, board/AGM cadence, FEMA returns, registers; foreign equivalents),
  with owners, due dates and the consequence of a miss. Use to stand up or audit an entity's recurring-compliance
  obligations. Not for a one-off resolution/minute → corporate/board-minutes-resolutions; not for the FDI route/
  reporting of a specific investment → corporate/fdi-fema-assessment.
module: corporate
version: 1.0.0
jurisdictions: [IN, global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of build (produce the calendar for an entity), audit (check current compliance against what's due) or gap-fix (plan remediation of missed/overdue items).
  - name: entity
    required: false
    description: The entity type (private/public/LLP/listed/regulated), jurisdiction(s) of incorporation, financial-year end, and whether it has foreign investment or is listed.
  - name: context
    required: false
    description: Known filings already made, any overdue items, and who owns compliance (company secretary / finance / external).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/board-minutes-resolutions, corporate/fdi-fema-assessment, corporate/corporate-governance-review, corporate/listed-company-disclosure, matters/legal-kpi-dashboard]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Entity Compliance Calendar

Takes an entity and returns the full recurring-compliance picture: every periodic filing, register, meeting and return it must make, each with an owner, a due date, and the penalty for a miss. The deliverable is a maintainable calendar (or an audit against one), not a generic list of "annual filings".

## When to use / not use

- Use: standing up the compliance calendar for a company/LLP; auditing whether an entity is current on its statutory obligations; planning remediation for overdue filings; onboarding a new entity or jurisdiction.
- Hand off: drafting a specific resolution/minute the calendar calls for → `corporate/board-minutes-resolutions`; the route/caps/reporting of a specific foreign investment → `corporate/fdi-fema-assessment`; the governance-structure health check → `corporate/corporate-governance-review`; listed-company event disclosure (distinct from periodic filings) → `corporate/listed-company-disclosure`; rolling compliance metrics into a department dashboard → `matters/legal-kpi-dashboard`.

## Inputs to collect first

1. The **entity type and jurisdiction(s)** — a private company, public company, LLP, listed, or regulated entity each carry different obligations.
2. The **financial-year end** and incorporation date (they drive AGM and annual-filing deadlines).
3. Whether the entity has **foreign investment / overseas holdings** (FEMA returns) or is **listed/regulated** (additional periodic filings).
4. What's already filed and any known overdue items; who owns compliance.

## Method

1. **Classify the entity and pull the applicable obligation set.** The right list depends on type/status — don't apply a public-company checklist to a small private company or miss LLP-specific filings `[verify current]`.
2. **Map the periodic statutory filings.** In India: annual return (**MGT-7/7A**), financial statements (**AOC-4**), director KYC (**DIR-3 KYC**), **DPT-3**, auditor appointment (**ADT-1**), and event-based forms — each with its trigger and due date; for foreign jurisdictions, the local annual-return/accounts equivalents.
3. **Map the meeting and register cadence.** Minimum **board meetings** per year (and the max gap between them), the **AGM** deadline, and the statutory **registers/minute books** that must be maintained → `corporate/board-minutes-resolutions`.
4. **Add FEMA / foreign-investment returns where relevant.** Annual **FLA** return, **FC-GPR/FC-TRS** on investment events, and any ODI/overseas-holding returns → `corporate/fdi-fema-assessment`.
5. **Add listed/regulated periodic obligations.** Periodic financial results, governance reports, and any sector-regulator returns (distinct from event-based disclosure) `[verify current]`.
6. **Assign owner, due date and lead-time per item.** Each obligation gets a responsible owner, the statutory due date, and an internal prep deadline with buffer — a calendar without owners doesn't get actioned.
7. **State the consequence of a miss.** Late fees, additional-fee multipliers, director disqualification risk, or strike-off exposure — so priorities are clear and overdue items get escalated.
8. **Audit mode:** reconcile what's due against what's filed; flag overdue items by severity and build the remediation (file now, pay additional fees, condonation/compounding where needed).
9. **Score against the Checks table** and output the calendar (or audit) with overdue/high-risk items at the top.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Wrong obligation set for the entity type | Calendar matched to type/status/jurisdiction | S1 | Re-baseline to the entity `[verify current]` |
| Core annual filing missed (MGT-7 / AOC-4 etc.) | All periodic statutory filings mapped + due dates | S1 | File now; budget additional fees |
| Board-meeting / AGM cadence not tracked | Minimum cadence + max-gap + AGM deadline set | S2 | Add the meeting calendar |
| Statutory registers/minute books not maintained | Required registers listed + upkeep owner | S2 | Stand up the registers |
| FEMA / FLA returns omitted where FDI exists | FLA + event returns included | S2 | Add the FEMA returns → fdi-fema-assessment |
| Listed/regulated periodic filings missed | Sector/listing periodic obligations added | S2 | Add the regulated filings `[verify current]` |
| Items without an owner or due date | Owner + due date + lead-time per item | S2 | Assign owners and dates |
| Consequence of a miss not stated | Penalty/disqualification/strike-off noted | S3 | Add the consequence column |
| (Audit) overdue items not escalated | Overdue flagged + remediation planned | S1 | Escalate and remediate |

## Output

Lead with `Compliance: CURRENT | GAPS TO FIX | OVERDUE ITEMS — <entity> — <top risk>`. Then the output contract. Add:

- **Calendar table**: obligation · basis/form · frequency · due date · owner · lead-time · consequence of miss.
- **Meetings & registers**: board/AGM cadence + registers to maintain.
- **FEMA / listed / regulated**: the extra periodic returns where applicable.
- **(Audit) overdue items**: with severity and remediation.
- One JSON finding per overdue/high-risk item with `category: "compliance-calendar"`.

## Edge cases & pitfalls

- **Wrong checklist**: applying a one-size list misses LLP-, listed-, or regulated-specific items, or over-burdens a small private company — set entity type first.
- **Event-based vs periodic**: a calendar that only lists annual filings misses event-triggered forms (charge creation, director change, allotment) — map both.
- **Owner-less calendar**: obligations with no named owner slip; the due date alone doesn't file the form.
- **Strike-off / disqualification creep**: repeated missed annual filings can lead to director disqualification or company strike-off — overdue core filings are high-severity, not admin.
- **FEMA blind spot**: an entity with foreign investment that never files the FLA return accrues a silent, compounding exposure — include it whenever there's foreign holding.

## References

- Volatile facts: Indian filing forms, fees and deadlines are volatile — cite `[verify current]` on any load-bearing due date or form; use `IN-*` registered IDs where one applies.
- The governing company law and registry rules (Companies Act 2013 + MCA rules / LLP Act in India; local companies registries abroad); FEMA reporting rules; and listing/regulatory periodic-filing requirements.
