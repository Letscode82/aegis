---
name: contracts-dispute-resolution-clause
description: >-
  Designs or reviews the dispute-resolution clause in a contract: arbitration vs court, the seat and governing law,
  institution and rules, number of arbitrators and language, any multi-tier (negotiation/mediation) escalation, and the
  enforceability traps that make a clause pathological. Use when drafting or negotiating a DR/jurisdiction clause. Not
  for running an actual arbitration → disputes/arbitration-strategy; not for the governing-law vs jurisdiction choice
  across the whole contract → contracts/contract-review.
module: contracts
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce a clause), review (assess a proposed/received clause) or compare (weigh arbitration vs litigation for this deal).
  - name: deal
    required: false
    description: The contract type, the parties and where they/assets sit, the likely dispute value and nature, and whether cross-border enforcement will matter.
  - name: preferences
    required: false
    description: Any client preference on seat, institution, language, confidentiality, or a tiered escalation, and the counterparty's likely stance.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [disputes/arbitration-strategy, contracts/contract-review, disputes/early-case-assessment, contracts/negotiation-prep, disputes/deadline-calendar]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Dispute Resolution Clause Design

Takes a deal and returns a dispute-resolution clause that will actually work when a dispute arises: the right forum, a clean seat/rules/tribunal specification, a sensible escalation tier, and no pathology that lets a party dodge or stall. The deliverable is a drafted/reviewed clause with the enforceability risks flagged, not a boilerplate arbitration paragraph.

## When to use / not use

- Use: drafting or negotiating the DR/jurisdiction clause in a contract; reviewing a counterparty's proposed clause; deciding arbitration vs court for a particular deal; fixing a clause that reads as pathological.
- Hand off: running or strategising an arbitration that has started → `disputes/arbitration-strategy`; the whole-contract review (including governing-law choice) → `contracts/contract-review`; the merits/value of a live dispute → `disputes/early-case-assessment`; preparing to negotiate the clause's terms with the other side → `contracts/negotiation-prep`; computing limitation/procedural deadlines once a dispute exists → `disputes/deadline-calendar`.

## Inputs to collect first

1. The **contract type** and the **parties** — where each is incorporated and holds assets (drives enforcement and forum choice).
2. The likely **nature and value** of disputes, and whether **cross-border enforcement** will matter.
3. Client **preferences**: forum, seat, institution, language, confidentiality, and appetite for a multi-tier escalation.
4. The **governing law** of the contract (distinct from the seat / procedural law).

## Method

1. **Choose the forum deliberately — arbitration vs court.** Arbitration offers neutrality, confidentiality, and (via the **New York Convention**) broad cross-border enforceability of awards; courts offer appeals, summary judgment, and sometimes speed/cost for domestic, low-value, or injunction-heavy matters. Match the choice to the parties, value, and where enforcement must bite `[verify current]`.
2. **If arbitration: specify the four essentials cleanly.** **Seat** (which fixes the *lex arbitri* and the supervisory courts — not the hearing venue), **institution + rules** (SIAC, ICC, LCIA, MCIA, or ad hoc/UNCITRAL), **number of arbitrators** (1 or 3) and **appointment mechanism**, and the **language**. Omitting or garbling any of these creates uncertainty a party can exploit.
3. **Avoid pathology.** Guard against inconsistent routes (both arbitration *and* exclusive court jurisdiction), a non-existent/misnamed institution, an impossible seat, optional/permissive wording ("may refer to arbitration") that isn't binding, or asymmetric clauses that some jurisdictions refuse to enforce `[verify current]`.
4. **Design the escalation tier carefully.** A negotiation→mediation→arbitration tier can be useful, but make the steps **clear and time-boxed**; a vague "parties shall endeavour to resolve amicably" precondition can block or delay the claim and spawn its own dispute about whether it was satisfied.
5. **Preserve interim/urgent relief.** Carve out the right to seek urgent interim/injunctive relief from a court (or confirm emergency-arbitrator availability under the rules) so arbitration doesn't bar a freezing order.
6. **Match the clause to governing law and to India specifics.** Keep governing law, seat, and jurisdiction coherent; in India watch the **unilateral-appointment** bar (CORE v ECI, 2024) and seat-vs-venue case law, and keep the arbitration agreement valid and stamped `[verify current]`.
7. **Scope what's covered.** Define the disputes caught ("arising out of or in connection with"), carve out any that should go elsewhere (e.g. IP validity, expert determination of technical points), and address multi-contract/consolidation if the deal has related agreements.
8. **Confidentiality and costs.** Address confidentiality (not automatic in all seats), and any costs-allocation or fast-track option for low-value disputes.
9. **Score against the Checks table** and set a verdict: **ENFORCEABLE / ENFORCEABLE WITH FIXES / PATHOLOGICAL (redraft)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Forum choice not matched to enforcement | Arbitration/court chosen for where awards must bite | S1 | Re-choose for the enforcement reality `[verify current]` |
| Seat missing/ambiguous (vs venue) | Seat clearly stated and distinct from venue | S1 | Fix the seat |
| Institution/rules absent or misnamed | Correct institution + rules specified | S1 | Name the real institution and rules |
| Inconsistent routes (arbitration + court) | One coherent, exclusive route | S1 | Remove the conflicting path |
| Permissive ("may") / non-binding wording | Mandatory, binding reference | S2 | Make it binding |
| Escalation tier vague / not time-boxed | Clear, time-limited steps | S2 | Tighten or drop the tier |
| Urgent interim relief barred | Court/EA interim-relief carve-out | S2 | Add the carve-out |
| Unilateral appointment / unstamped (India) | Neutral appointment; agreement valid + stamped | S1 | Fix per Indian law `[verify current]` |
| Scope/consolidation unclear in multi-contract deal | Covered disputes + consolidation addressed | S2 | Define scope and consolidation |
| Confidentiality assumed but not stated | Confidentiality expressly addressed | S3 | Add the confidentiality term |

## Output

Lead with `Verdict: ENFORCEABLE | ENFORCEABLE WITH FIXES | PATHOLOGICAL — <deal> — <key reason>`. Then the output contract. Add:

- **Forum rationale**: arbitration vs court and why, tied to enforcement.
- **Clause spec** (arbitration): seat · institution + rules · arbitrators + appointment · language · scope.
- **Escalation & relief**: tier design + interim-relief carve-out.
- **Draft/redline** of the clause. One JSON finding per issue with `category: "dr-clause"`.

## Edge cases & pitfalls

- **Seat vs venue confusion**: naming a hearing "venue" as if it fixed the supervisory law leaves the seat uncertain — state the seat explicitly.
- **Pathological "both forums" clause**: a clause pointing to arbitration and exclusive court jurisdiction invites a jurisdictional fight before the merits — pick one route.
- **Amicable-resolution trap**: an unenforceably-vague pre-arbitration step can stall or bar the claim while the parties argue over whether it was met.
- **Arbitration blocks the injunction**: without an interim-relief carve-out, a party may be unable to get an urgent freezing order — preserve court access for urgency.
- **India unilateral appointment**: a clause letting one interested party appoint the (sole) arbitrator is vulnerable post-CORE v ECI — use a neutral mechanism and ensure the agreement is stamped.

## References

- Volatile facts: `IN-ARB-01` (unilateral-appointment bar), `IN-COMM-01` (pre-institution mediation / Commercial Courts interactions). New York Convention status, seat-law rules, and asymmetric-clause enforceability are volatile — cite `[verify current]` where load-bearing.
- The New York Convention and the chosen seat's arbitration statute; the selected institution's model clause and rules; Indian Arbitration & Conciliation Act case law on seat/venue and appointment.
