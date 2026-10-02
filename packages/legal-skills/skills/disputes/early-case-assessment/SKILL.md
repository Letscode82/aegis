---
name: disputes-early-case-assessment
description: >-
  Produces an early case assessment for a new or threatened dispute: merits by issue, exposure range,
  cost-to-resolve, decision tree with expected value, and a recommended strategy (settle, defend, pursue,
  arbitrate). Use when a claim, legal notice, demand letter or arbitration notice arrives, the business asks
  "what is this worth / should we settle / should we sue", or the matter needs a reserve. Not for attacking
  a finished argument → disputes/adversarial-stress-test; not for computing deadlines → disputes/deadline-calendar.
module: disputes
version: 1.0.0
jurisdictions: [IN, UK, US, global]
risk_tier: review-required
inputs:
  - name: dispute_summary
    required: true
    description: Who claims what from whom, amount, and the triggering document (notice, plaint, request for arbitration, demand).
  - name: our_role
    required: true
    description: Claimant / respondent / both (counterclaim); entity involved.
  - name: key_documents
    required: true
    description: Contract (with dispute-resolution clause), core correspondence, notice received or sent.
  - name: chronology
    required: false
    description: Output of disputes/chronology-builder if available; otherwise built in step 2.
  - name: business_context
    required: false
    description: Relationship value, precedent risk, publicity, insurance, counterparty solvency.
  - name: cost_inputs
    required: false
    description: Outside counsel rates or budget, internal time, expected forum duration.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [disputes/chronology-builder, disputes/litigation-hold, disputes/adversarial-stress-test, disputes/deadline-calendar, disputes/settlement-agreement, disputes/arbitration-strategy, disputes/legal-notice-drafter, outside-counsel/matter-budget, corporate/board-pack]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Early Case Assessment (ECA)

The first 30 days of a dispute decide most of its cost. This skill gives the GC a defensible view of where the case stands: what each issue is worth, what it will cost to find out, and which path maximises net value once business factors are weighed. The outcome is a reasoned recommendation with numbers, a reserve suggestion, and the immediate protective steps.

## When to use / not use

- Use on receipt of: legal notice, demand, plaint/summons, request for arbitration, s.21 Arbitration Act notice, regulator-adjacent civil claim, or when we are considering bringing a claim.
- Hand off: preservation duty triggered (almost always) → `disputes/litigation-hold`; facts are scattered → `disputes/chronology-builder` first; limitation or procedural dates → `disputes/deadline-calendar`; reply notice → `disputes/legal-notice-drafter`; regulator-led matters → `disputes/regulatory-investigation`.

## Inputs to collect first

1. Our role and the precise relief claimed (amount, injunction, specific performance, declaration).
2. The dispute-resolution clause (court vs arbitration, seat, institution, tiered steps) — it decides forum, timeline and cost.
3. Dates: accrual of cause of action, last acknowledgment or part-payment, date notice received. These drive limitation.
4. Insurance (D&O, PI, CGL, cyber) and contractual indemnities — notification deadlines can be short.
5. Counterparty solvency and assets in enforceable jurisdictions — a win you cannot collect is worth the costs only.

## Method

1. **Urgent protective screen (day 0–2)** — any of these is S1 and goes to the top of the output:
   - limitation expiring within 90 days (claimant side) — Limitation Act 1963, Schedule (e.g. Art. 55: three years for breach of contract from breach) [verify current article for the cause of action];
   - court/tribunal response deadline running (Written statement in commercial suits: 30 days, extendable to 120 days maximum, CPC Order VIII r.1 as amended by Commercial Courts Act 2015);
   - need for interim relief (Arbitration Act 1996 s.9 / s.17; CPC Order XXXIX) or risk of asset dissipation;
   - insurance notification window;
   - preservation duty triggered → issue hold.
2. **Frame the issues.** Break the case into independent liability issues (formation, breach, causation, limitation, exclusion/cap, quantum, set-off). Merits are scored per issue, not as a gut feel for the whole.
3. **Score each issue**: probability of success (our side) in 10% steps with a one-line reason tied to documents or authority. Use: ≥70% strong, 40–60% arguable, ≤30% weak. If evidence is not yet seen, cap at 60% and say why.
4. **Quantify exposure / recovery**: low (realistic best), mid (most likely), high (reasonable worst — not the pleaded figure unless supportable). Include interest (CPC s.34; Arbitration Act s.31(7)), costs shifting (CPC s.35 as substituted for commercial disputes — costs generally follow the event; Arbitration Act s.31A), and contractual caps/exclusions.
5. **Cost-to-resolve** by phase (pre-action, pleadings, evidence, hearing, appeal/challenge, enforcement), external + internal, and time. Use `outside-counsel/matter-budget` if a budget exists.
6. **Decision tree and expected value (EV)**: chain issue probabilities; EV = Σ(probability × outcome) − costs not recoverable. Present the tree for settle-now vs litigate (and arbitrate if available). Sensitivity: show which single probability flips the recommendation.
7. **Score the risk** on the 3×4 matrix: impact S-level from exposure (and non-monetary harm), likelihood of an adverse outcome. State the one-line reason.
8. **Overlay business factors**: relationship, precedent/copycat claims, publicity, regulatory spill-over, management time, disclosure obligations (listed entity → `corporate/listed-company-disclosure`), provisioning (Ind AS 37: provide if probable outflow and reliable estimate; disclose if possible).
9. **Recommend** one strategy with a settlement range (walk-away and target), next three steps, and review triggers (events that require re-running the ECA).

## Checks / issue list

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Limitation (claimant) | Suit/arbitration commenced within period; s.18 written acknowledgment or s.19 part-payment extends; arbitration commencement = receipt of s.21 notice (Arbitration Act s.43) | S1 if < 90 days left | File protectively; hand to `disputes/deadline-calendar` |
| Limitation (defendant) | Plead time-bar; court must dismiss a time-barred suit even if not pleaded (Limitation Act s.3) | Info / strong defence | Lead with it |
| Forum | Arbitration clause valid, seat clear; else court with jurisdiction; Commercial Court if "commercial dispute" ≥ specified value (Commercial Courts Act 2015 s.2(1)(c), (i)) | S3 if forum unclear | `contracts/dispute-resolution-clause` analysis |
| Pre-institution mediation | Commercial suit without urgent interim relief must first go through s.12A mediation; suits filed without it are liable to be rejected — *Patil Automation Pvt Ltd v Rakheja Engineers Pvt Ltd* (SC, 2022) [verify citation] | S2 (claimant) | Initiate mediation; plead urgency only if genuine |
| Tiered clause | Negotiation/mediation steps complied with or demonstrably futile | S3 | Comply quickly; preserve record |
| Liability caps / exclusions | Cap and exclusions apply to the claim; carve-outs checked | Per exposure | Quantify both with and without cap |
| Evidence | Electronic records admissible with certificate (Bharatiya Sakshya Adhiniyam 2023 s.63); key witnesses still employed | S2 if core evidence at risk | Hold + witness retention |
| Summary disposal | Commercial suits: summary judgment where no real prospect of defence (CPC Order XIII-A) | Opportunity | Assess early application |
| Enforceability of a win | Counterparty assets; foreign award enforceable (New York Convention, Arbitration Act Part II; reciprocating territory for decrees, CPC s.44A) | S2 if no collectable assets | Weigh security for costs / settle |
| Arbitration timeline | Award within 12 months of completion of pleadings, extendable 6 months by consent, then court (Arbitration Act s.29A) [verify current] | Info | Budget accordingly |
| Award challenge | s.34 application within 3 months + up to 30 days, no further extension | S1 if running | Diary immediately |
| Insurance | Notified within policy window; insurer consent before settlement | S2 | Notify now |
| Counterclaim / set-off | Identified and limitation-checked | S3 | Plead or preserve |

## Other jurisdictions (key differences)

- **England & Wales**: Limitation Act 1980 s.5 (six years, simple contract), s.8 (twelve years, deed); Practice Direction – Pre-Action Conduct; costs shifting (CPR Part 44) and Part 36 offers change settlement EV materially; disclosure under PD 57AD in the Business and Property Courts.
- **US**: limitation varies by state (contract typically 3–6 years) [verify]; American rule — each side bears its own fees absent contract or statute, so EV excludes fee recovery unless a fee clause exists; discovery cost is often the largest driver; Rule 68 offers of judgment shift post-offer costs (not fees).
- **International arbitration**: tribunal costs discretion (e.g. ICC Rules Art. 38; LCIA Art. 28; SIAC Rules) — usually "costs follow the event" with adjustments.

## Output

Follow `_shared/output-contract.md`. Lead with `Recommendation: SETTLE | DEFEND | PURSUE | ARBITRATE | MONITOR — <reason>; rating <Red/Amber/Green>`. Then add:

1. **Urgent steps** (any S1 from step 1) with dates.
2. **Issue scorecard** — issue · our probability · reason · pinpoint/authority.
3. **Exposure table** — low / mid / high, with interest and costs, and with/without cap.
4. **Decision tree** — text or Mermaid, with EV per branch:

```
Litigate ─┬─ Liability found (45%) ─┬─ Cap applies (70%) → –₹4.0 cr
          │                         └─ Cap fails  (30%) → –₹11.0 cr
          └─ No liability (55%) → +₹0.6 cr costs recovered
          Less own costs: ₹1.8 cr  → EV ≈ –₹3.8 cr
Settle now at ₹3.0 cr → EV –₹3.0 cr (+ relationship preserved)
```

5. **Settlement range** — target and walk-away, with the assumptions that would move them.
6. **Reserve / provisioning note** for Finance (not an accounting opinion).
7. **Review triggers**.

Label `Privileged & Confidential — prepared at the direction of counsel` and `Draft — requires lawyer review`; prepare in contemplation of litigation and route through counsel to preserve privilege.

## Edge cases & pitfalls

- **False precision**: probabilities are judgments; give the reason and the sensitivity, not two-decimal EVs.
- **Pleaded amount ≠ exposure**: anchor on provable loss, remoteness (Indian Contract Act s.73) and caps, not on the demand figure.
- **Liquidated damages** in India: recoverable only up to a reasonable compensation not exceeding the stated sum (Contract Act s.74) [general principle — verify current case law].
- **Section 138 NI Act** cheque cases and other quasi-criminal routes change settlement leverage; flag separately.
- **Regulatory overlay** (competition, data, securities, bribery facts): a civil claim may reveal conduct that triggers self-reporting or investigation — escalate per STANDARDS §8.
- **Group exposure**: similar contracts elsewhere → the precedent cost belongs in the EV.
- Do not send the ECA to the business owner without a privilege header; summarise via `matters/status-report` for wider audiences.
