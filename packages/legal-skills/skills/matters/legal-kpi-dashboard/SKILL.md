---
name: matters-legal-kpi-dashboard
description: >-
  Defines and computes legal-department KPIs from matter, spend and intake data: the metrics that answer a real
  management question (cycle time, matter load, spend vs budget, outside-counsel mix, SLA/throughput), each with an
  explicit definition, denominator and caveat, so the numbers are honest and comparable. Use to design a KPI pack or
  compute/sanity-check reported metrics. Not for a single matter's status → matters/status-report; not for the spend
  detail itself → outside-counsel/matter-budget.
module: matters
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of design (choose + define the KPI set for a question), compute (calculate metrics from supplied data) or review (sanity-check a reported dashboard for definition/denominator flaws).
  - name: question
    required: false
    description: The management question the dashboard must answer (where is time going?, are we on budget?, is the team overloaded?) and the audience (GC, CFO, board).
  - name: data
    required: false
    description: The available data — matters (type/status/dates), spend/invoices/budgets, intake tickets/SLAs, headcount — and its known gaps.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [matters/status-report, outside-counsel/matter-budget, matters/raid-log, matters/lessons-learned, outside-counsel/performance-scorecard]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Legal KPI Pack

Takes a management question and the department's data and returns a KPI set that answers it honestly: each metric defined precisely, with its denominator, period, and caveats, so the numbers mean what they appear to mean. The deliverable is a defined, computable KPI pack (or a sanity-check of one), not a pile of vanity charts.

## When to use / not use

- Use: designing a legal-department KPI/dashboard for a GC, CFO, or board; computing metrics from matter/spend/intake data; sanity-checking a reported dashboard whose numbers look off or flattering.
- Hand off: narrating a single matter's progress → `matters/status-report`; the detailed spend/budget analysis behind a cost KPI → `outside-counsel/matter-budget`; tracking risks/issues on a matter → `matters/raid-log`; the post-matter retrospective → `matters/lessons-learned`; scoring an individual firm's performance → `outside-counsel/performance-scorecard`.

## Inputs to collect first

1. The **management question** the pack must answer, and the **audience** (the right KPIs for a board differ from an ops team).
2. The **available data** and its **known gaps** (missing close dates, un-tagged matters, partial spend) — gaps determine which metrics are honest.
3. The **period and comparison** basis (month/quarter, YoY, vs budget/target).
4. Any existing dashboard to review.

## Method

1. **Start from the question, pick metrics that answer it.** Each KPI must map to a decision the audience will make; a metric that changes no decision is noise. Resist "because we can measure it".
2. **Define every KPI precisely — this is the core work.** State the exact numerator, **denominator**, inclusion/exclusion rules, the period, and the data source. "Cycle time" is meaningless until you fix *which* start and end events and *which* matters count.
3. **Guard the denominators and empty/partial cases.** Decide how open/ongoing matters, cancelled items, and zero-denominator cases are handled; an average that silently drops in-flight matters or divides by zero misleads — exclude explicitly and show the count.
4. **Choose honest aggregates.** Prefer **medians/percentiles** over means for skewed data (cycle time, cost per matter); show distribution, not just a single number, where the average hides the story.
5. **Make metrics comparable across periods.** Hold definitions stable; if a definition changes, flag the break so a trend isn't an artefact of re-definition. Normalise for load/headcount where comparing teams.
6. **Carry the caveats with the number.** Each KPI states its data-quality caveat and sample size; a confident figure on thin/partial data gets a visible health flag, not a footnote nobody reads.
7. **Compute reproducibly.** The calculation should be re-runnable from the stated source and rules; show the inputs so a reader can trust (or challenge) the figure.
8. **Avoid perverse incentives.** Flag KPIs that would drive bad behaviour if targeted (e.g. closing matters fast at the cost of quality) and pair them with a balancing metric.
9. **(Review mode)** audit a reported dashboard for undefined terms, denominator tricks, mean-vs-median distortion, redefinition breaks, and uncaveated thin data.
10. **Score against the Checks table** and output the defined pack (or the review) with each KPI's definition and health flag.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| KPI doesn't map to a decision | Each metric tied to a management question | S2 | Cut or re-choose the metric |
| Metric undefined (numerator/denominator/period) | Precise definition stated | S1 | Define it fully before reporting |
| Denominator / empty-case handling hidden | Inclusions/exclusions + counts explicit | S1 | State the denominator and exclusions |
| Mean used on skewed data | Median/percentile + distribution shown | S2 | Switch to median; show spread |
| Definition changed, trend not flagged | Stable definitions; breaks flagged | S2 | Flag the re-definition |
| Thin/partial data shown as confident | Data-quality caveat + sample size on the number | S1 | Add the health flag |
| Not reproducible from source | Inputs + rules shown; re-runnable | S2 | Expose the calculation |
| KPI drives a perverse incentive | Balancing metric paired | S3 | Add the counter-metric |
| Teams compared without normalising | Normalised for load/headcount | S3 | Normalise the comparison |

## Output

Lead with `KPI pack: <question> — <n> metrics — top read: <the headline the data supports>`. Then the output contract. Add:

- **KPI definitions**: per metric — numerator · denominator · period · source · caveat.
- **Computed values** (compute mode): value + sample size + health flag, medians where skewed.
- **Caveats & breaks**: data-quality flags and any definition changes.
- **(Review mode)** the definition/denominator/distortion findings.
- One JSON finding per definitional or data-quality issue with `category: "legal-kpi"`.

## Edge cases & pitfalls

- **Undefined "cycle time"**: without fixed start/end events and a matter set, the number is unfalsifiable — define it before computing.
- **Denominator games**: averages that silently drop open matters or cancelled items flatter the result — show the count and the exclusions.
- **Mean on skew**: a mean cost-per-matter dominated by one mega-matter misrepresents the typical case — use the median and show the distribution.
- **Silent re-definition**: a "big improvement" that's really a definition change is the classic dashboard lie — flag definition breaks.
- **Vanity metrics**: counts that go up and look good but drive no decision crowd out the few that matter — tie every KPI to a decision.

## References

- Volatile facts: none; this is a data/definition discipline, not a legal-authority one.
- Standard metric-definition and data-quality practice (explicit denominators, median vs mean, reproducibility); the department's own matter/spend/intake data and its documented gaps.
