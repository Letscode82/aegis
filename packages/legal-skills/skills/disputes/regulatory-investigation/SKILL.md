---
name: disputes-regulatory-investigation
description: >-
  Runs the response to a regulator inquiry, dawn raid, subpoena, information notice or enforcement action: scoping the
  demand, preserving and collecting responsive material, the privilege and self-incrimination analysis, a production
  plan, interview readiness, parallel-proceedings risk, and the privileged investigation workstream. Use when a
  regulator asks questions, demands documents, opens an enforcement case, or shows up. Not for an internal HR
  allegation → employment/workplace-investigation; not for a court deadline calendar → disputes/deadline-calendar.
module: disputes
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: demand
    required: true
    description: What the regulator sent or did — inquiry letter, information/production notice, subpoena, dawn raid, show-cause / enforcement notice — with its deadline and legal basis.
  - name: regulator
    required: false
    description: Which authority and regime (competition, securities, data protection, financial-services, sectoral), and whether criminal exposure is in play.
  - name: scope
    required: false
    description: The conduct/period/entities in question, who is likely implicated, and any parallel civil, criminal or cross-border proceedings.
  - name: posture
    required: false
    description: Cooperate / contest / negotiate — and whether self-reporting or a leniency/settlement route is open.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [disputes/litigation-hold, disputes/early-case-assessment, employment/workplace-investigation, disputes/document-disclosure, regulatory/anti-bribery, regulatory/sanctions-screening]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Regulatory Investigation Response

Takes a regulator's demand and turns it into a controlled, defensible response plan: what must be preserved and produced, what is privileged or protected, how to meet the deadline without waiving rights, and how to run the organisation's own privileged fact-finding in parallel. The deliverable is a response plan with a posture recommendation, not a summary of the regulator's powers.

## When to use / not use

- Use: a regulator sends an inquiry/information notice, subpoena or production demand; a dawn raid or on-site inspection happens or is feared; an enforcement or show-cause notice arrives; deciding whether to self-report.
- Hand off: a purely internal employee-conduct allegation → `employment/workplace-investigation`; preserving evidence the moment litigation/investigation is anticipated → `disputes/litigation-hold`; the court/tribunal deadline math → `disputes/deadline-calendar`; the disclosure/production review mechanics → `disputes/document-disclosure`; the underlying bribery/sanctions substance → `regulatory/anti-bribery` / `regulatory/sanctions-screening`.

## Inputs to collect first

1. The exact demand: instrument type, legal basis, scope, and deadline (and whether it is extendable).
2. The regulator and regime, and whether criminal exposure or individual liability is in play.
3. The conduct, period and entities in scope, and who is likely implicated.
4. Any parallel proceedings (civil, criminal, other regulators, other jurisdictions) that a response could prejudice.
5. The organisation's posture options: cooperate, contest, negotiate, self-report/leniency.

## Method

1. **Trigger the legal hold immediately.** The moment an investigation is reasonably anticipated, preservation duties attach — suspend routine deletion and issue the hold before anything else → `disputes/litigation-hold`. Spoliation after a demand is the most damaging own-goal.
2. **Scope and validate the demand.** Confirm the regulator's power to require what it asks, the precise scope, the deadline, and whether it is negotiable. An over-broad demand can often be narrowed by engagement — but do not simply refuse.
3. **Run the privilege map first.** Identify what is legal-advice / litigation privileged and protect it; be deliberate about creating new privileged material (route fact-finding through counsel). Note that privilege rules differ by regime — in-house privilege is **not** recognised in some competition/regulatory contexts (e.g. EU competition `Akzo`), so mark `[verify current]`.
4. **Assess self-incrimination and compelled-information protections.** Some regimes compel answers but restrict their later use; others don't. Map which protections apply before anyone answers, especially where criminal exposure exists.
5. **Build the production plan.** Collect responsively (custodians, systems, date range), review for responsiveness + privilege + personal data, log privilege withholdings, and produce in the required form with a clear index. Preserve the chain of custody → `disputes/document-disclosure`.
6. **Prepare for a dawn raid / on-site inspection** if that is a risk: a raid protocol (who meets the inspectors, what they can and cannot take, legal-privilege objections at the door, no obstruction, contemporaneous notes).
7. **Run the organisation's own privileged investigation in parallel** to understand the facts, quantify exposure, and inform the posture — kept privileged and separate from the regulator-facing production.
8. **Decide the posture.** Cooperate (and whether to self-report/seek leniency, often the best outcome for a genuine breach), contest (where the demand or case is legally flawed), or negotiate scope/settlement. Weigh cooperation credit against admissions and parallel-proceedings risk.
9. **Manage parallel-proceedings and cross-border risk** — a statement to one regulator can be discoverable by another or by a civil claimant; coordinate so one response doesn't detonate another front.
10. **Score against the Checks table** and set a decision: **COOPERATE / CONTEST / NEGOTIATE (+ self-report?)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Legal hold not issued on notice of the inquiry | Hold issued + routine deletion suspended immediately | S1 | Issue now → `disputes/litigation-hold`; document the timeline |
| Privileged material at risk of waiver in production | Privilege reviewed + logged before producing | S1 | Hold production; re-review; assert privilege |
| Answering under compulsion without the use-protection analysis | Self-incrimination / use-restriction mapped first | S1 | Pause; get the protection analysis |
| Deadline missed or not engaged | Met, or a documented extension agreed | S2 | Engage the regulator; seek extension |
| Over-broad demand complied with wholesale | Scope validated and narrowed by engagement | S2 | Negotiate scope before collecting everything |
| No dawn-raid protocol where a raid is possible | Protocol + trained front-desk/legal response | S2 | Prepare the protocol now |
| Regulator-facing facts and privileged investigation not separated | Two distinct, firewalled workstreams | S2 | Firewall them; route fact-finding via counsel |
| Parallel-proceedings prejudice unassessed | Cross-front impact mapped before responding | S2 | Coordinate the response across fronts |
| Self-report / leniency window missed | Explicit decision taken in time | S2 | Assess leniency before someone else reports |

## Output

Lead with `Posture: COOPERATE | CONTEST | NEGOTIATE — <regulator/demand> — <key reason>` (note self-report if recommended). Then the output contract. Add:

- **Demand summary**: instrument, legal basis, scope, deadline.
- **Immediate actions**: hold, privilege map, collection scope, raid protocol — with owners and the clock.
- **Production plan**: custodians · systems · date range · review gates · form of production.
- **Risk notes**: privilege-regime caveats, self-incrimination protections, parallel-proceedings exposure — each `[verify current]` where the rule varies.
- One JSON finding per issue with `category: "regulatory-investigation"`.

## Edge cases & pitfalls

- **Privilege is not universal**: some regulators/regimes don't recognise in-house or even external privilege for certain material — never assume the domestic litigation rule applies.
- **Cooperation that becomes admission**: volunteering characterisations (not just documents) can bind the organisation; cooperate on facts, be careful with conclusions.
- **Deletion after the demand**: even "routine" auto-deletion running after notice is spoliation — the hold must stop it.
- **One regulator's answer feeding another front**: assume anything produced can travel; sequence and firewall accordingly.
- **Individual vs entity exposure**: employees may need separate counsel where their interests diverge from the organisation's.

## References

- Volatile facts: cite live where a limitation, leniency window or reporting duty is load-bearing; mark `[verify current]`.
- The regulator's governing statute and investigation powers; applicable privilege and self-incrimination rules per regime; leniency/settlement frameworks where available.
