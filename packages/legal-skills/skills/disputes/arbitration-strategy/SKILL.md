---
name: disputes-arbitration-strategy
description: >-
  Plans arbitration strategy from the clause outward: seat and governing law, institutional vs ad hoc rules, tribunal
  constitution and arbitrator selection, interim/emergency relief, and — decided first — where an award will be
  enforced and whether it will be recognised there (New York Convention). Use to shape strategy before or at the start
  of an arbitration. Not for the pre-action demand → disputes/legal-notice-drafter; not for designing the clause in a
  contract → contracts/dispute-resolution-clause.
module: disputes
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of strategy (full plan), clause-read (interpret the arbitration agreement and its consequences) or enforcement-map (assess where/whether an award will be recognised).
  - name: dispute
    required: false
    description: The dispute, the parties and where each holds assets, the amount at stake, and whether proceedings/notice have started.
  - name: clause
    required: false
    description: The arbitration agreement — seat, governing law, rules/institution, number of arbitrators, language — and the underlying contract's governing law.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/dispute-resolution-clause, disputes/legal-notice-drafter, disputes/early-case-assessment, disputes/deadline-calendar, disputes/document-disclosure]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Arbitration Strategy

Takes an arbitration (or an about-to-start dispute under an arbitration clause) and returns a strategy built backwards from enforcement: where the award must bite, whether it will be recognised there, and the seat/rules/tribunal/relief choices that get there. The deliverable is an enforcement-anchored plan with the clause consequences and early-relief options mapped, not a generic "go to arbitration".

## When to use / not use

- Use: shaping strategy at the outset of an arbitration; reading an arbitration clause for its strategic consequences (seat, rules, tribunal, scope); deciding on interim/emergency relief; planning for recognition and enforcement of the eventual award.
- Hand off: designing/negotiating an arbitration clause in a contract being drafted → `contracts/dispute-resolution-clause`; the pre-action demand/notice to arbitrate's precursor → `disputes/legal-notice-drafter`; the merits/quantum/settle-or-fight assessment → `disputes/early-case-assessment`; the limitation and procedural-deadline math → `disputes/deadline-calendar`; the document-production plan → `disputes/document-disclosure`.

## Inputs to collect first

1. The **arbitration agreement**: seat, governing law of the contract **and** of the arbitration agreement, rules/institution, number of arbitrators, language, scope.
2. The dispute, the amount, and — critically — **where each party holds assets** (this decides where enforcement must work).
3. Whether a notice to arbitrate / proceedings have started, and any limitation pressure.
4. Any urgency requiring interim or emergency relief (asset dissipation, preservation).

## Method

1. **Start from enforcement, not the hearing.** Identify where the respondent's **assets** are and whether an award will be **recognised and enforced** there — most states are New York Convention parties, but confirm the enforcement forum and its grounds to refuse (Art. V) `[verify current]`. A win you can't enforce is worthless; this choice drives everything else.
2. **Fix the seat and its consequences.** The **seat** determines the *lex arbitri* (the supervisory court, annulment/set-aside grounds, interim-relief powers) — distinct from the hearing venue and the contract's governing law. A poor seat exposes the award to set-aside; confirm the seat and what its courts can do.
3. **Read the clause for scope and gaps.** What disputes it covers, whether it's binding, multi-tier (mediation/negotiation **conditions precedent** that can bar a premature claim), and any pathology (inconsistent seat/rules, non-existent institution) that needs curing.
4. **Institutional vs ad hoc + rules.** Institutional administration (SIAC, ICC, LCIA, MCIA, etc.) vs ad hoc (e.g. UNCITRAL); pick for the dispute's size, need for a default-appointing authority, and emergency-arbitrator availability.
5. **Tribunal constitution and arbitrator selection.** Sole vs three; the appointment mechanism; independence/impartiality and disclosure. In India, note the bar on **unilateral appointment** by an interested party (CORE v ECI, 2024) `[verify current]`. Build an arbitrator profile for the issues (sector, law, language).
6. **Interim / emergency relief.** Where urgent, assess emergency-arbitrator relief under the rules and/or court-ordered interim measures at the seat or where assets sit (freezing/preservation); align the two routes.
7. **Procedure and evidence.** Document production expectations (often IBA-Rules-style), witness/expert strategy, bifurcation of jurisdiction/merits/quantum, and the timetable → `disputes/document-disclosure`.
8. **Jurisdiction and challenges.** Preserve jurisdiction objections (kompetenz-kompetenz), watch for a set-aside/anti-suit angle, and avoid steps that waive objections.
9. **Score against the Checks table** and set the strategy with the enforcement forum, seat, and relief plan stated up front.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Enforcement forum / asset location not mapped | Where assets sit + recognition confirmed | S1 | Map enforcement before strategy `[verify current]` |
| Award not enforceable at target (NYC/grounds) | Convention status + Art. V risks checked | S1 | Re-target enforcement; mitigate the grounds |
| Seat/lex arbitri consequences ignored | Seat fixed; supervisory court + set-aside grounds known | S1 | Analyse the seat's regime |
| Multi-tier condition precedent skipped | Mediation/negotiation steps satisfied before filing | S1 | Complete the pre-arbitration tier |
| Pathological clause uncured | Clause defects identified + a workable route found | S2 | Resolve the pathology / apply default rules |
| Unilateral/biased arbitrator appointment (India) | Neutral appointment mechanism used | S1 | Avoid unilateral appointment `[verify current]` |
| Emergency/interim relief missed on urgency | EA + court interim options assessed | S2 | Seek preservation/freezing relief |
| Jurisdiction objection waived by conduct | Objections preserved; no waiving steps | S2 | Reserve the objection explicitly |
| Document-production/evidence plan absent | Production scope + witness/expert plan set | S3 | Build the evidence plan → document-disclosure |

## Output

Lead with `Strategy: <proceed/respond/relief-first> — enforce in <forum>; seat <seat>; <key move>`. Then the output contract. Add:

- **Enforcement map**: asset locations · recognition forum · NYC/Art. V risks.
- **Seat & rules**: seat (lex arbitri) · institution/ad hoc · language.
- **Tribunal**: number · appointment mechanism · arbitrator profile.
- **Relief**: emergency-arbitrator / court interim measures plan.
- **Procedure**: production, witnesses/experts, bifurcation, timetable.
- One JSON finding per strategic risk with `category: "arbitration"`.

## Edge cases & pitfalls

- **Winning the unenforceable award**: choosing seat/strategy without first checking where assets are and whether the award is recognised there is the fundamental error — enforcement comes first.
- **Seat ≠ venue ≠ governing law**: conflating the legal seat with the hearing venue or the contract's governing law leads to the wrong supervisory court and set-aside exposure.
- **Skipping the multi-tier step**: filing before a mandatory mediation/negotiation condition precedent can get the claim stayed or dismissed.
- **Unilateral appointment (India)**: an appointment by one interested party is vulnerable post-CORE v ECI — use a neutral mechanism.
- **Waiving jurisdiction by participating**: taking merits steps without reserving a jurisdiction objection can waive it — reserve explicitly.

## References

- Volatile facts: `IN-ARB-01` (unilateral-appointment bar, CORE v ECI SPIC, 2024), `IN-COMM-01` (pre-institution mediation interactions). New York Convention status, seat-law set-aside grounds, and institutional emergency-arbitrator rules are volatile — cite `[verify current]` where load-bearing.
- The arbitration agreement + underlying contract; the seat's arbitration statute and the New York Convention; the chosen institution's rules and the IBA Rules on evidence where adopted.
