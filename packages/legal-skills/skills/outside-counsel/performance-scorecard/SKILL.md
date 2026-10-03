---
name: outside-counsel-performance-scorecard
description: >-
  Designs and runs outside-counsel performance evaluation: the scorecard dimensions (legal quality/outcomes,
  responsiveness/service, cost discipline/budget accuracy, efficiency/innovation, diversity, relationship), how each
  is measured and weighted, the post-matter feedback capture, and the quarterly/annual firm review that feeds panel
  decisions. Use to build or run a firm scorecard. Not for selecting firms via an RFP → outside-counsel/panel-rfp;
  not for computing department-wide KPIs → matters/legal-kpi-dashboard.
module: outside-counsel
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of design (build the scorecard + cadence), capture (structure post-matter feedback for one matter/firm) or review (compile a quarterly/annual firm review from collected data).
  - name: firms
    required: false
    description: The firm(s) under review, the matters they handled, and any existing feedback/spend/outcome data.
  - name: priorities
    required: false
    description: Which dimensions matter most (outcomes, cost, service, diversity, innovation) and the audience for the review.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [outside-counsel/panel-rfp, outside-counsel/billing-guidelines, outside-counsel/matter-budget, outside-counsel/invoice-review, matters/legal-kpi-dashboard]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Firm Performance Scorecard

Takes an outside-counsel relationship and returns a fair, decision-useful evaluation: scorecard dimensions defined and weighted, feedback captured close to the work, and a review that actually informs panel and instruction decisions. The deliverable is a defined scorecard (or a compiled review), not a vague "they did fine".

## When to use / not use

- Use: building a firm-performance scorecard; capturing structured feedback right after a matter; compiling a quarterly/annual firm review that feeds panel and work-allocation decisions.
- Hand off: selecting or re-tendering firms via a competitive process → `outside-counsel/panel-rfp`; the OCG terms performance is measured against → `outside-counsel/billing-guidelines`; the budget-accuracy data that feeds the cost dimension → `outside-counsel/matter-budget` and `outside-counsel/invoice-review`; department-wide (not firm-specific) KPIs → `matters/legal-kpi-dashboard`.

## Inputs to collect first

1. The **firm(s) and matters** under review and any **feedback/spend/outcome** data already held.
2. The **priority dimensions** (outcomes, cost, service, diversity, innovation) and their weights.
3. The **audience** (GC, panel committee, the firm itself) — the review's tone and detail follow it.
4. The review **cadence** (per-matter + quarterly/annual).

## Method

1. **Define the dimensions and how each is measured.** Typical set: **legal quality/outcomes**, **responsiveness/service**, **cost discipline** (budget accuracy, write-downs, OCG compliance), **efficiency/innovation** (use of technology, staffing leverage), **diversity-and-inclusion** of the team, and **relationship/commerciality**. For each, state the evidence that scores it — a score with no basis is opinion.
2. **Weight to the client's priorities.** Fix weights up front tied to what the client values; don't let a strong outcome mask chronic over-billing, or vice versa.
3. **Separate outcome from performance.** A matter can be lost with excellent lawyering or won despite poor service — score the firm's *conduct and value*, not just the result, so the scorecard isn't pure outcome-luck.
4. **Capture feedback close to the work.** Structure a short post-matter feedback form completed by the matter owner while memory is fresh; aggregate across matters rather than relying on one halo/horns impression.
5. **Use objective data where it exists.** Budget accuracy (estimate vs actual), write-down rates, OCG-compliance/invoice-rejection rates, and responsiveness SLAs come from `outside-counsel/matter-budget` / `invoice-review` — anchor the subjective scores to these.
6. **Guard against bias.** Multiple raters where possible, consistent scale definitions, and a check that recency, relationship, or a single bad interaction isn't dominating; note sample size (one small matter is weak evidence).
7. **Make it actionable and two-way.** The review should drive decisions (more/less work, rate conversations, off-panel) and be shared constructively with the firm with specific examples — a scorecard nobody acts on is theatre.
8. **Track trend.** Compare against prior periods and the panel average so improvement/decline is visible, and feed the result into the next panel decision → `outside-counsel/panel-rfp`.
9. **Score against the Checks table** and output the scorecard definition (or the compiled review with scores, evidence, and recommended actions).

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Dimensions undefined / unmeasurable | Each dimension has a measurement basis | S1 | Define the evidence per dimension |
| Weights not set to priorities | Weighted to what the client values | S2 | Fix weights up front |
| Outcome conflated with performance | Conduct/value scored separately from result | S1 | Separate the two |
| Feedback not captured near the work | Post-matter form while fresh | S2 | Capture at matter close |
| Subjective scores not anchored to data | Budget/write-down/compliance data used | S2 | Anchor to objective metrics |
| Bias / tiny sample unguarded | Multiple raters + sample size noted | S2 | Flag thin evidence; add raters |
| Review not actionable | Decisions + specific examples | S2 | Tie scores to actions |
| No trend / panel comparison | Period-over-period + vs panel average | S3 | Add the trend view |
| One-way / never shared with firm | Constructive two-way feedback | S3 | Share with examples |

## Output

Lead with `Scorecard: <firm> — overall <score/band> — top action: <keep/grow/address/off-panel>`. Then the output contract. Add:

- **Dimensions & weights**: each with its measurement basis.
- **Scores & evidence**: per dimension, anchored to data where possible.
- **Outcome vs performance**: the result, and the conduct/value separately.
- **Actions & trend**: recommended decisions + period/panel comparison.
- One JSON finding per weak dimension or data gap with `category: "firm-scorecard"`.

## Edge cases & pitfalls

- **Outcome luck**: scoring a firm high because the matter was won (or low because it was lost) rewards luck, not lawyering — separate conduct from result.
- **Halo/horns**: one memorable interaction dominating the whole score — capture per-matter and aggregate.
- **Opinion dressed as score**: numbers with no evidence basis are unaccountable — require the basis.
- **Thin sample**: judging a firm on one small matter is weak — note sample size and weight accordingly.
- **Scorecard theatre**: a review nobody acts on, or that's never shared with the firm, changes nothing — tie it to decisions and feedback.

## References

- Volatile facts: none; this is an evaluation-design discipline.
- Standard firm-evaluation practice; the objective data from budget/invoice/OCG-compliance tracking; the client's own priorities and panel structure.
