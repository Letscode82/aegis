---
name: outside-counsel-invoice-review
description: >-
  Reviews an outside counsel invoice line by line against the engagement letter, billing guidelines and matter
  budget, and returns proposed adjustments with reasons plus a firm-ready note. Use when an invoice or LEDES file
  arrives, someone asks "is this bill reasonable", spend is over budget, or before approving payment in AEGIS Spend.
  Not for building the budget → outside-counsel/matter-budget; not for writing the guidelines →
  outside-counsel/billing-guidelines.
module: outside-counsel
version: 1.0.0
jurisdictions: [global, IN, UK, US]
risk_tier: review-required
inputs:
  - name: invoice
    required: true
    description: Invoice (PDF) or e-billing file (LEDES 1998B / 1998BI / XML) with time entries, timekeepers, rates and expenses.
  - name: billing_guidelines
    required: false
    description: Outside counsel guidelines (OCGs) applicable to the firm. Falls back to the defaults below.
  - name: engagement_terms
    required: false
    description: Engagement letter or panel agreement - approved rates, timekeepers, fee arrangement, caps, discounts, payment terms.
  - name: budget
    required: false
    description: Matter budget by phase (UTBMS phase codes) and spend to date.
  - name: matter_context
    required: false
    description: What happened in the period (hearings, filings, deal milestones) to test whether effort was reasonable.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [outside-counsel/billing-guidelines, outside-counsel/matter-budget, outside-counsel/fee-arrangements, outside-counsel/performance-scorecard, outside-counsel/local-counsel-management, platform/ai-use-billing-record, matters/status-report]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Outside Counsel Invoice Review

Invoice review is not about shaving minutes; it is about paying for the work we asked for, at the price we agreed, and spotting early when a matter is drifting from its budget or staffing plan. This skill checks every line against the agreed terms, proposes adjustments that the firm will recognise as fair because each one cites the rule it relies on, and drafts the note that goes back to the firm.

## When to use / not use

- Use for: hourly, capped, phased and blended-rate invoices; local counsel invoices passed through lead counsel; pre-bills; accrual checks at period end.
- Hand off: budget design or reforecast → `outside-counsel/matter-budget`; drafting or changing OCGs → `outside-counsel/billing-guidelines`; persistent quality issues → `outside-counsel/performance-scorecard`; changing the fee model → `outside-counsel/fee-arrangements`; AI-assisted time entries and disclosure → `platform/ai-use-billing-record`.

## Inputs to collect first

1. The **governing terms**: engagement letter beats panel agreement beats general OCGs, unless the engagement letter says otherwise. If no OCGs are supplied, use the defaults below and say so.
2. **Approved rate card and timekeeper list** (with seniority). Without these, rate checks become "reasonableness" observations (S4/Info), not adjustments.
3. **Budget and spend to date** by phase, so variance is calculated rather than guessed.
4. What actually happened in the period. An effort spike before a hearing is expected; the same spike in a dormant month is not.

## Method

1. **Parse and reconcile**: line items sum to the invoice total; tax computed on the right base; currency and FX stated; period covered; matter number correct; no line already billed on a prior invoice (duplicate check by date + timekeeper + hours + narrative similarity).
2. **Arithmetic & rate check**: hours × rate = amount for every line; rate ≤ approved rate for that timekeeper and year; agreed discount applied; no rate increase without written approval and notice period.
3. **Staffing check**: timekeepers on the approved list; seniority matches the task (partner doing document review, associate time on administrative tasks); new timekeepers' learning-curve time; more than the allowed number of attendees at meetings, calls or hearings; internal conferencing between firm lawyers.
4. **Narrative check**: block billing, vague descriptions, minimum increments, administrative/clerical work, research on basic law, preparing invoices or responding to billing queries.
5. **Task coding**: UTBMS phase/task/activity codes present and correct (e.g. litigation `L100`–`L500`, activities `A101`–`A111`, expenses `E101`–`E124`); misallocation that hides phase overruns.
6. **Expense check**: receipts above threshold, non-reimbursable overheads, travel class and time policy, third-party vendors (experts, e-discovery, translators) pre-approved.
7. **Budget & variance**: compute variance by phase. >10% over phase budget without prior notice → finding; >25% or cap exceeded → S2 and escalate to matter owner.
8. **Propose adjustments**: each with line reference, amount, rule cited, and whether it is a **reduction** (we will not pay), **hold** (pending information) or **query** (explain or we will reduce).
9. **Decide**: **APPROVE** (no adjustments or only S4 notes), **APPROVE WITH ADJUSTMENTS** (approve net of reductions, release holds on answer), **REJECT & RETURN** (arithmetic or rate errors across the invoice, wrong matter, missing required LEDES data, or adjustments >15% of fees).

## Checks / issue list (defaults when OCGs are silent)

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Rates above approved card | Every rate ≤ approved rate for that timekeeper and period | S2 | Reduce to approved rate for all hours; flag in note |
| Unapproved rate increase | Increase only with written notice and our approval | S2 | Reduce to prior rate |
| Unapproved timekeeper | On approved staffing plan | S3 | Hold; approve if justified, else write off |
| Block billing | One task per entry with its own time | S3 | Query; if not split within 10 business days, reduce block by an agreed % (default 20%) |
| Vague narrative ("review documents", "attention to matter", "work on file") | Says what, which document, why | S3 | Query; reduce if unanswered |
| Billing increment | 0.1 h (6 min) increments; no minimum charges for emails | S4 | Recompute |
| Administrative / clerical (filing, scanning, scheduling, conflict checks, file opening) | Overhead, not billable | S3 | Reduce in full |
| Senior timekeeper on junior task | Task at lowest competent level | S3 | Reduce to rate of appropriate level |
| Multiple attendees | One attendee per internal call/meeting unless pre-approved; max two at hearings | S3 | Reduce extra attendees |
| Intra-firm conferencing | Only the senior attendee bills, or capped | S4 | Reduce |
| Training / learning curve on new staff | Not billable | S3 | Reduce |
| Legal research > threshold (e.g. 3 h) | Pre-approved; no billing for basic law | S3 | Query / reduce |
| Invoice preparation, billing disputes | Not billable | S3 | Reduce in full |
| Travel time | 50% of rate, only productive or pre-approved; no local commute | S3 | Reduce |
| Expenses: photocopying, printing, phone, database subscriptions, overtime meals, secretarial OT | Overheads not reimbursable | S4 | Reduce |
| Expenses: travel above class/policy; no receipts above threshold (e.g. ₹5,000 / $75 / £50) | Within travel policy; receipts attached | S3 | Hold pending receipts |
| Third-party vendor / expert without pre-approval | Pre-approved in writing | S2 | Hold; escalate to matter owner |
| Duplicate entries / previously billed | None | S2 | Reduce in full |
| Phase variance | Within 10% of phase budget, or reforecast approved in advance | S3 (>10%), S2 (>25% or cap breach) | Hold excess pending reforecast |
| Fee cap / fixed fee exceeded | Billing at or under cap | S2 | Reduce to cap; fixed-fee scope creep needs a change request |
| UTBMS codes missing or wrong | Correct phase/task/activity code per line | S4 (S3 if it masks a phase overrun) | Return for recoding |
| AI-assisted work | Time billed reflects actual human time; tool cost per engagement terms; disclosure per guidelines | S3 | Query; see `platform/ai-use-billing-record` |
| Late submission | Within OCG window (e.g. 60 days after period end) | S4 | Note; enforce write-off only if OCGs say so |
| Matter number / entity billed | Correct AEGIS matter and invoicing entity | S3 | Return |

## India-specific checks

- **GST**: legal services supplied by an advocate or firm of advocates to a business entity are generally under **reverse charge** — the recipient pays GST (Notification No. 13/2017-Central Tax (Rate), entry 2) `[verify current]`. An Indian law firm invoice charging GST forward-charge to a business recipient is a finding (S3) — confirm with tax before paying to avoid double tax. Foreign counsel = import of services; IGST under reverse charge.
- **TDS**: withholding on fees for professional services under the Income-tax Act — s.194J of the 1961 Act was replaced by the corresponding provision of the Income-tax Act 2025 from tax year 2026-27 (`IN-TAX-01`) `[verify current]`. Check whether the invoice's gross-up or "net of tax" language matches the engagement terms. Foreign counsel payments: s.195-equivalent withholding / DTAA and Form 15CA/CB process `[verify current]`.
- **Bar Council of India rules**: advocates may not charge fees contingent on the result (BCI Rules, Part VI, Ch. II, r.20); a success-fee line from an Indian advocate is S2 — route to `outside-counsel/fee-arrangements`.
- Arbitration/litigation in India: separate senior counsel "appearance" and "conference" fees are often billed per appearance rather than hourly; review against the agreed fee note, not the hourly rules above.
- MSME vendor? If the firm is registered under the MSMED Act 2006, payment beyond 45 days attracts compound interest (s.15–16) and Form MSME-1 reporting. Holds must be raised promptly and in writing.

## Other jurisdictions

- **US**: LEDES/UTBMS is standard; ABA Model Rule 1.5 (reasonable fees) is the yardstick in fee disputes. Do not ask counsel to alter time records to look different from what was done — reductions are ours to take, not theirs to disguise.
- **UK**: solicitor's bill rights under the Solicitors Act 1974 (assessment by the court, s.70) `[general principle — verify]`; SRA Code requires the best possible information on costs.
- Local counsel passed through lead counsel: check whether mark-up is permitted and whether the local invoice has been reviewed by lead counsel first.

## Output

Lead with `Decision: APPROVE | APPROVE WITH ADJUSTMENTS | REJECT & RETURN — <net payable> (<% adjusted>)`. Follow `_shared/output-contract.md` (category `billing`). Then add:

**Adjustment schedule**

| # | Line / date | Timekeeper | Billed | Proposed | Type (reduce/hold/query) | Rule (OCG § / engagement cl.) | Reason |
|---|---|---|---|---|---|---|---|

**Budget position**: phase, budget, billed to date, this invoice, variance %, forecast to complete (if known).

**Firm-ready note**: courteous, specific, ≤250 words, no internal commentary or severity labels, citing guideline clauses, totalling reductions, asking for a revised invoice or explanation by a date, and noting holds will be released on response. Example opening: "Thank you for invoice INV-123 for March. We have approved ₹X and applied the adjustments below under sections 4.2 and 6.1 of our Outside Counsel Guidelines…"

## Edge cases & pitfalls

- Never cite an OCG clause the firm has not accepted; if the guideline is ours but not in the engagement, phrase it as a request.
- A reduction for "too much time" needs a benchmark (prior similar matters, budget, the work product). Without one, raise a query, not a cut.
- Do not adjust twice for the same issue (e.g. block-billing reduction plus vague-narrative reduction on the same line).
- Fixed and capped fees: hourly detail is for information; do not apply hourly rules to reduce a fixed fee unless scope was not delivered.
- Privileged narratives: invoices can be disclosable in fee disputes or cost recovery; do not add commentary into AEGIS fields that are exported to the firm.
- Accruals: holds still accrue for finance purposes; tell finance the expected range.
- Pattern across invoices (same issue three months running) → feed `outside-counsel/performance-scorecard` rather than escalating the tone of the note.

## References

- Volatile facts: `IN-TAX-01` (Income-tax Act 2025 TDS provisions from 1 Apr 2026) `[verify current]`.
- UTBMS code sets (utbms.com); LEDES formats (ledes.org).
