---
name: outside-counsel-fee-arrangements
description: >-
  Designs the fee model for a matter or portfolio — hourly, fixed/flat, capped, collared, phased, retainer, contingency
  or success fee, or a blended AFA — matched to the scope, predictability and risk, with the scope definition,
  assumptions, change mechanism and incentive-alignment that make it hold. Use to choose and structure a fee
  arrangement. Not for the per-matter budget/forecast → outside-counsel/matter-budget; not for the OCG billing rules
  → outside-counsel/billing-guidelines.
module: outside-counsel
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of design (choose + structure the fee model), review (assess a firm's proposed fee arrangement) or compare (weigh options for a matter/portfolio).
  - name: matter
    required: false
    description: The matter or portfolio, its scope and predictability, the risk profile and desired outcome, and the budget/appetite.
  - name: constraints
    required: false
    description: Any ethical limits on fee type (e.g. contingency restrictions), the firm's proposal, and how success would be measured.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [outside-counsel/matter-budget, outside-counsel/billing-guidelines, outside-counsel/panel-rfp, outside-counsel/performance-scorecard, disputes/early-case-assessment]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Alternative Fee Arrangements

Takes a matter (or portfolio) and returns the fee model that fits its scope, predictability and risk — with the scope, assumptions, change mechanism and incentives drawn tightly enough that the arrangement holds. The deliverable is a structured fee design (or a review of a proposal) with the risk-allocation and incentive traps flagged, not a preference for "fixed fee" in the abstract.

## When to use / not use

- Use: choosing and structuring a fee arrangement for a matter or portfolio; reviewing a firm's fee proposal; comparing hourly vs fixed vs capped vs success-based options against scope and risk.
- Hand off: building the cost forecast/budget once a model is chosen → `outside-counsel/matter-budget`; the OCG billing rules the fee sits inside → `outside-counsel/billing-guidelines`; pricing collected across a panel tender → `outside-counsel/panel-rfp`; measuring whether the firm delivered value → `outside-counsel/performance-scorecard`; the case-merits assessment behind a contingency/success fee → `disputes/early-case-assessment`.

## Inputs to collect first

1. The **matter/portfolio** and its **scope predictability** — the single biggest driver of which model works.
2. The **risk profile** and the client's **appetite** (certainty vs potential upside), and how **success** is defined.
3. Any **ethical/regulatory limits** on fee type (contingency/conditional-fee restrictions by jurisdiction and matter type) `[verify current]`.
4. The firm's proposal (for review) and historical cost data for similar matters.

## Method

1. **Match the model to predictability and risk.** Well-scoped, repeatable work suits **fixed/flat** fees; uncertain-scope work suits **hourly with a cap or collar** or **phased** fees (fix each phase as scope clarifies); outcome-driven disputes may suit **contingency/success** fees; steady-state advice suits a **retainer**. Don't fix-fee genuinely unpredictable work, or burn hourly on commoditisable work.
2. **Define scope and assumptions tightly — this makes or breaks an AFA.** A fixed/capped fee is only as good as its scope statement and stated assumptions (number of parties, rounds, jurisdictions, document volume); vague scope turns every surprise into a dispute → `outside-counsel/matter-budget`.
3. **Build the change mechanism.** Specify what counts as out-of-scope and how it's priced (hourly overflow, pre-agreed unit rates, re-set trigger) so scope creep is handled by formula, not fight.
4. **Allocate risk deliberately.** A **cap** protects the client but the firm bears overrun risk (watch under-staffing); a **collar** shares it; a **success fee** transfers outcome risk at the cost of upside. State who bears what and the behavioural effect.
5. **Align incentives — and guard against the perverse ones.** A fixed fee can incentivise under-servicing; hourly incentivises inefficiency; contingency can incentivise early settlement over the client's interest. Pair the model with quality safeguards and, where useful, a holdback/bonus tied to outcome or satisfaction.
6. **Check the ethics.** Contingency/conditional fees are restricted or barred for certain matters and in certain jurisdictions (and for certain parties); confirm the model is permissible and the agreement meets any writing/consent requirements `[verify current]`.
7. **Make success measurable (for success/contingency).** Define the trigger and the measure objectively (outcome, threshold, milestone) so the fee event isn't itself a dispute.
8. **Document and sanity-check.** Blended rate / total-cost estimate, worked examples at best/expected/worst case, and a comparison to the hourly baseline so the client sees the trade.
9. **Score against the Checks table** and set a recommendation: the chosen model, the scope/assumptions, the change mechanism, and the risk split.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Model mismatched to scope predictability | Fixed for scoped, phased/capped for uncertain | S1 | Re-match the model to the work |
| Scope / assumptions not defined | Tight scope + explicit assumptions | S1 | Define scope → matter-budget |
| No out-of-scope / change mechanism | Change pricing + re-set trigger set | S1 | Add the change mechanism |
| Risk allocation unstated | Who bears overrun/outcome risk is explicit | S2 | State the risk split |
| Perverse incentive unguarded | Quality safeguard / holdback paired | S2 | Add the counter-incentive |
| Ethical limit on fee type missed | Contingency/conditional permissibility confirmed | S1 | Verify and comply `[verify current]` |
| Success trigger subjective | Objective measure/milestone defined | S2 | Make the trigger measurable |
| No baseline comparison / worked examples | Best/expected/worst vs hourly shown | S3 | Add the comparison |
| Writing/consent formality missed | Fee agreement meets form requirements | S2 | Paper it properly |

## Output

Lead with `Fee model: <model> — <matter> — risk split: <who bears what>`. Then the output contract. Add:

- **Model & rationale**: the chosen arrangement and why it fits scope/risk.
- **Scope & assumptions**: the tight scope statement and its assumptions.
- **Change mechanism**: out-of-scope pricing / re-set triggers.
- **Incentives & ethics**: risk allocation, safeguards, permissibility.
- **Economics**: blended/total estimate + best/expected/worst examples.
- One JSON finding per issue with `category: "fee-arrangement"`.

## Edge cases & pitfalls

- **Fixed fee on unknowable scope**: fixing a price before scope is understood guarantees either an overrun dispute or a padded quote — phase it instead.
- **Scope statement as afterthought**: the AFA lives or dies on its scope and assumptions — vague scope converts every surprise into a fee fight.
- **Cap that invites under-staffing**: a hard cap with no quality safeguard can push the firm to under-resource — pair with service standards.
- **Contingency where barred**: success/contingency fees are restricted in many jurisdictions and matter types — confirm permissibility before proposing.
- **Unmeasurable "success"**: a success fee tied to a subjective outcome becomes its own dispute — define the trigger objectively.

## References

- Volatile facts: cite `[verify current]` where a jurisdiction's rules on contingency/conditional fees, fee-sharing, or fee-agreement formalities are load-bearing.
- Standard AFA design practice and the governing professional-conduct/fee rules; the matter's scope and the client's risk appetite.
