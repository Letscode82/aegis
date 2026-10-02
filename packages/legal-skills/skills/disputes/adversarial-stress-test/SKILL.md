---
name: disputes-adversarial-stress-test
description: >-
  Attacks our own argument, pleading, contract position, advice memo or settlement offer the way competent
  opposing counsel, a sceptical tribunal or a regulator would, then ranks the weaknesses and proposes fixes.
  Use when someone asks to "red-team", "poke holes", "play devil's advocate", "what will the other side say",
  or before filing, sending a notice, signing off advice, or making an offer. Not for an initial merits view
  of a new dispute → disputes/early-case-assessment; not for persuasive editing → drafting/persuasive-writing.
module: disputes
version: 1.0.0
jurisdictions: [global, IN, UK, US]
risk_tier: internal
inputs:
  - name: target
    required: true
    description: The thing to attack — draft pleading, submission, notice, legal memo, negotiation position, contract interpretation, or settlement offer.
  - name: our_objective
    required: true
    description: What the document must achieve (win the application, get the claim paid, settle within range, defend the clause reading).
  - name: record
    required: false
    description: Chronology, key documents, the other side's correspondence or pleadings, prior rulings.
  - name: adversary
    required: false
    description: Who will attack — counterparty counsel, tribunal, regulator, journalist, auditor. Defaults to opposing counsel.
  - name: forum
    required: false
    description: Court/tribunal/regulator and governing law; changes procedural attacks.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [disputes/early-case-assessment, disputes/chronology-builder, disputes/settlement-agreement, disputes/arbitration-strategy, drafting/persuasive-writing, research/citation-verification, contracts/negotiation-prep]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Adversarial Stress Test

Teams fall in love with their own case. This skill switches sides: it reads the target as the best lawyer on the other side would, builds the strongest counter-case, and then returns to our side with a ranked list of vulnerabilities and concrete repairs. The outcome is a document that has already survived its first attack, and a clear-eyed view of what cannot be fixed.

## When to use / not use

- Use before: filing a pleading or application; sending a legal notice or reply; issuing an advice memo the board will rely on; tabling a settlement offer; taking a public or regulator-facing position on a contract or law.
- Hand off: no position yet exists → `disputes/early-case-assessment`; the attack reveals the need for more facts → `disputes/chronology-builder`; style and structure fixes → `drafting/persuasive-writing`; any citation in doubt → `research/citation-verification`.

## Inputs to collect first

1. The target document and what it must achieve.
2. The record the adversary will have (assume they will get our documents through disclosure unless privileged).
3. Who the adversary is — a regulator attacks differently from a counterparty.
4. Any constraints: positions already taken in earlier correspondence or pleadings (they cannot be walked back cheaply).

## Method

1. **State our case in one paragraph** — claims, key facts, legal basis, remedy. If it cannot be stated in one paragraph, that is the first finding.
2. **Adopt the adversary's role.** Write their best counter-case, not a straw man. Run each lens below; for each, produce the attack as they would phrase it, with the document or authority they would cite.
3. **Lenses** (run all; skip only with a stated reason):
   - **Facts**: which facts we rely on are `asserted` not `documented`; contrary documents; witnesses who will not support us; documents we have not seen that they may have.
   - **Law**: element-by-element — which element is weakest; contrary authority; whether our authority is distinguishable, obiter, overruled or from another jurisdiction; statutory amendments (India: old-to-new code transitions — IPC→BNS, CrPC→BNSS, Evidence Act→BSA, labour statutes→Codes `IN-LAB-01`).
   - **Construction**: the other reasonable reading of each clause we rely on; contra proferentem; entire-agreement and no-oral-modification clauses; course of dealing.
   - **Procedure**: limitation, jurisdiction, arbitrability, standing, pre-conditions (s.12A Commercial Courts Act mediation; s.80 CPC notice; tiered clauses), pleading defects, defective verification or statement of truth.
   - **Remedy and quantum**: causation, remoteness (Contract Act s.73), mitigation, penalty vs LD (s.74), caps and exclusions, double counting, interest basis.
   - **Consistency**: contradictions with our own earlier letters, pleadings, board papers, public statements, regulatory filings, or positions in other matters (estoppel/credibility).
   - **Equity and optics**: delay, unclean hands, how a judge or the press reads our conduct; whether the position embarrasses us in another forum or with a regulator.
   - **Counter-moves**: counterclaim, set-off, interim injunction against us, regulatory complaint, criminal complaint (e.g. cheating/breach-of-trust allegations used for leverage), publicity.
   - **For settlement offers**: anchoring, what the offer concedes, admissions risk (use "without prejudice"; in India, protection for without-prejudice communications is recognised as a general principle and by the BSA provision succeeding Evidence Act s.23 (admissions in civil cases made on express condition) [verify BSA section number]), tax and enforceability gaps.
4. **Score each attack**: impact on our objective as an S-level, likelihood the adversary raises it and it lands (likely/possible/remote), one-line reason → 3×4 matrix rating.
5. **Return to our side.** For each Red/Amber attack, propose the repair: add evidence, re-plead, narrow the claim, add an alternative case, concede the point, re-sequence arguments, change the offer structure. Mark attacks with **no repair** — these feed the ECA probability and settlement range.
6. **Pre-empt or hold**: decide for each repaired weakness whether to address it in the document (pre-emption) or hold the answer for reply. Default: pre-empt weaknesses the tribunal will certainly see; hold answers to points the adversary may miss, unless candour duties require disclosure (e.g. adverse binding authority).
7. **Re-score overall**: before vs after repairs, and say whether the document should go as is, go with repairs, or be reconsidered.

## Checks / issue list

| Attack | Test for robustness | Default severity | Repair |
|---|---|---|---|
| Missing legal element | Every element supported by fact + evidence + authority | S1 if fatal and unfixable | Re-plead alternative cause of action or reconsider |
| Fact asserted, not documented | Key facts have a documentary source | S2 | Locate evidence; witness statement; reframe |
| Contrary document in record | Addressed and explained | S2 | Pre-empt with explanation |
| Authority weak or unverified | Binding, current, on point, verified | S2 (S1 if fabricated) | Verify; replace; distinguish adverse authority |
| Limitation / jurisdiction | Clear on the record | S1 | Fix forum; file protectively; plead extension basis |
| Inconsistent prior position | Reconciled or explained | S2 | Explain change; amend narrowly |
| Over-claiming quantum | Each head proved and not duplicated | S3 | Trim; credibility gain |
| Remedy unavailable (e.g. specific performance of personal service) | Remedy legally available on these facts | S2 | Plead damages alternative |
| Admission in offer or notice | Marked without prejudice; no unnecessary concessions | S2 | Redraft |
| Regulatory/criminal spill-over | Position does not admit regulated misconduct | S1 | Escalate per STANDARDS §8 |
| Professional-conduct risk | No misleading statement; adverse binding authority disclosed where required | S1 | Correct before sending |

## Output

Follow `_shared/output-contract.md`. Lead with `Verdict: SEND | SEND WITH REPAIRS | RECONSIDER — <the single most damaging attack>`. Add:

1. **Our case in one paragraph** (as understood).
2. **The adversary's best case** — written in their voice, ≤400 words, so the team feels its force.
3. **Attack register** — attack · lens · their authority/evidence · S-level × likelihood → rating · repair · pre-empt or hold · residual risk.
4. **Unfixable weaknesses** — and their effect on settlement value.
5. **Redline suggestions** for the target where repairs are drafting changes.

JSON findings use `category` = the lens (`facts`, `law`, `construction`, `procedure`, `remedy`, `consistency`, `optics`, `counter-move`, `settlement`).

## Edge cases & pitfalls

- **Straw men**: if an attack would not be made by a competent lawyer, drop it; the value is in the strongest attacks, not the most.
- **Do not invent authority for the adversary.** If you believe contrary authority exists but cannot identify it, say "likely contrary authority on X — research needed" `[general principle — verify]`.
- **Privilege**: the stress test is pure work product; label it `Privileged & Confidential — prepared at the direction of counsel` and keep it out of business distribution.
- **Confirmation bias in reverse**: do not let the exercise talk the team out of a good case; end with the before/after rating, not just the list of attacks.
- **Different adversaries, different attacks**: a regulator cares about conduct and systemic issues, not contract construction; an arbitral tribunal may be less moved by procedural technicalities than a court; a journalist reads the optics lens only.
- **Indian practice**: interim-stage matters often turn on prima facie case, balance of convenience and irreparable harm — test the target against those three, not only final merits [general principle — verify].
