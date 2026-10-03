---
name: outside-counsel-panel-rfp
description: >-
  Structures a legal panel and runs the RFP: segment the work into categories, set the panel shape (firms per
  category, primary/secondary), build weighted evaluation criteria (expertise, price, service, diversity, conflicts,
  data security), design the RFP and scoring rubric, and plan onboarding and review. Use to design or re-tender a
  panel. Not for scoring an incumbent firm's ongoing performance → outside-counsel/performance-scorecard; not for
  designing the fee model itself → outside-counsel/fee-arrangements.
module: outside-counsel
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of design (structure the panel + criteria), run-rfp (build the RFP + scoring rubric) or evaluate (score received proposals against the rubric).
  - name: spend
    required: false
    description: The legal work mix and spend by category/jurisdiction, current firms, and the drivers for the panel (cost, quality, coverage, consolidation).
  - name: priorities
    required: false
    description: What matters most — price, specialist depth, geographic coverage, diversity, innovation/technology, relationship.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [outside-counsel/fee-arrangements, outside-counsel/billing-guidelines, outside-counsel/performance-scorecard, outside-counsel/local-counsel-management, outside-counsel/matter-budget]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Panel Design & RFP

Takes a legal-spend profile and returns a panel structure and an RFP that selects firms on the right criteria: work segmented into categories, a sensible panel shape, weighted and transparent scoring, and an onboarding/review plan. The deliverable is a defensible panel design + RFP + rubric (or a scored evaluation), not a generic "send out an RFP".

## When to use / not use

- Use: designing or re-tendering an outside-counsel panel; segmenting spend and setting panel shape; building the RFP questionnaire and weighted scoring rubric; evaluating received proposals consistently.
- Hand off: scoring an incumbent firm's delivery over time → `outside-counsel/performance-scorecard`; designing the fee model the RFP asks firms to price against → `outside-counsel/fee-arrangements`; the guidelines/engagement terms panel firms must accept → `outside-counsel/billing-guidelines`; coordinating multi-jurisdiction local counsel → `outside-counsel/local-counsel-management`; the per-matter budget → `outside-counsel/matter-budget`.

## Inputs to collect first

1. The **work mix and spend by category and jurisdiction** — the panel is built around the actual demand, not a generic practice list.
2. The **drivers** for the panel (cost reduction, quality, coverage, consolidation) and the **priority weights**.
3. The **current firms** and incumbents' performance signals.
4. Any procurement rules/process the organisation must follow.

## Method

1. **Segment the work into categories.** Group spend by practice area and jurisdiction (e.g. disputes, M&A, employment, IP, by region); the panel shape follows the segments, not the other way round. Separate high-volume/commoditisable work (price-led) from bet-the-company work (expertise-led).
2. **Set the panel shape per category.** Decide firms per category, primary vs secondary tiers, whether to consolidate for leverage or keep breadth for conflicts/coverage, and sole-source vs competitive categories.
3. **Build weighted evaluation criteria — before seeing proposals.** Expertise/track record, **price/fee model**, service/responsiveness, **conflicts** capacity, **data security**, diversity-and-inclusion, innovation/technology, and cultural fit — each with an explicit weight tied to the drivers. Fixing weights up front prevents post-hoc bias.
4. **Design the RFP.** Clear scope and volumes, the questions mapped to the criteria, a standard **rate/fee template** so bids are comparable, mandatory terms (acceptance of the OCG/engagement terms, conflicts disclosure, data-security attestations), and the timeline.
5. **Make bids comparable.** Require pricing in a fixed format (blended rates, fee caps, AFAs where wanted → `outside-counsel/fee-arrangements`) so you compare like with like, not one firm's discount against another's AFA.
6. **Score transparently.** Apply the weighted rubric to each proposal; separate price from quality scoring; sanity-check for low-ball pricing that won't hold and for conflicts that would sideline a firm.
7. **Plan onboarding and governance.** Onboarding (OCG acceptance, e-billing setup, relationship leads), volume commitments/expectations, and the **review cadence** that feeds the scorecard → `outside-counsel/performance-scorecard`.
8. **Keep it fair and defensible.** Consistent information to all bidders, documented scoring, and a clear decision rationale — so the result survives scrutiny and preserves firm relationships.
9. **Score against the Checks table** and output the panel design + RFP + rubric (or the scored evaluation with a recommendation).

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Panel not segmented by actual demand | Categories built from spend mix + jurisdictions | S1 | Re-segment around real demand |
| Criteria/weights set after seeing bids | Weighted rubric fixed before evaluation | S1 | Fix weights up front |
| Bids not comparable (no fee template) | Standard rate/fee format required | S1 | Impose a pricing template |
| Conflicts / data-security not scored | Conflicts capacity + security attestations assessed | S2 | Add to the rubric |
| Price and quality conflated | Separate price and quality scoring | S2 | Split the scoring |
| Low-ball pricing not stress-tested | Sustainability of the bid checked | S2 | Probe the pricing |
| D&I / innovation ignored where prioritised | Priority criteria represented | S3 | Add the criteria |
| No onboarding / review plan | Onboarding + review cadence set | S2 | Add governance → performance-scorecard |
| Process not fair / documented | Equal info + documented rationale | S2 | Make the process defensible |

## Output

Lead with `Panel: <n categories / n firms> — RFP ready | evaluation: recommend <firm(s)>`. Then the output contract. Add:

- **Segmentation & shape**: categories, firms-per-category, primary/secondary.
- **Rubric**: criteria + weights, tied to the drivers.
- **RFP**: scope, questions, pricing template, mandatory terms, timeline.
- **(Evaluate mode)** scored matrix + recommendation + conflicts/pricing flags.
- One JSON finding per design/scoring issue with `category: "panel-rfp"`.

## Edge cases & pitfalls

- **Generic categories**: a panel built around a textbook practice list instead of the client's real spend mis-covers the work — segment from demand.
- **Moving the goalposts**: setting or re-weighting criteria after bids arrive invites bias and challenge — lock the rubric first.
- **Apples-to-oranges bids**: without a fixed pricing template, a blended-rate bid and an AFA bid can't be compared — standardise the format.
- **Low-ball trap**: the cheapest bid that staffs junior-heavy or won't hold its rates costs more later — stress-test sustainability.
- **Conflicts blindness**: picking a firm that's conflicted out of your core disputes wastes a panel seat — score conflicts capacity.

## References

- Volatile facts: generally none; cite `[verify current]` only where a procurement rule constrains the process.
- Standard panel-management and legal-procurement practice; the organisation's spend data and procurement policy; UTBMS/AFA pricing conventions for comparability.
