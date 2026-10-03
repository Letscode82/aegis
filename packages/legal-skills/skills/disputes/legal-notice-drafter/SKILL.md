---
name: disputes-legal-notice-drafter
description: >-
  Drafts a pre-action letter, demand or statutory legal notice: the legal basis and facts, the specific demand and
  deadline, the consequences of non-compliance, mandatory statutory notice requirements (e.g. India CPC s.80 /
  contractual notice clauses / pre-action protocols), tone and without-prejudice posture, and service/proof. Use to
  draft or review a demand/notice before litigation. Not for the procedural deadline math → disputes/deadline-calendar;
  not for the settlement that may follow → disputes/settlement-agreement.
module: disputes
version: 1.0.0
jurisdictions: [global, IN, UK]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce the notice), review (assess a draft/received notice) or basis-check (confirm the claim basis + any mandatory notice requirement).
  - name: matter
    required: false
    description: The claim/cause of action, the facts and key dates, the counterparty, the contract or statute relied on, and the outcome sought.
  - name: constraints
    required: false
    description: Any mandatory statutory/contractual notice requirement, the forum likely to follow, limitation pressure, and whether settlement is wanted.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [disputes/deadline-calendar, disputes/settlement-agreement, disputes/early-case-assessment, contracts/contract-review, disputes/regulatory-investigation]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Pre-Action Letters & Legal Notices

Drafts (or reviews) the letter that precedes litigation so it advances the claim without creating own-goals: a clear legal basis and demand, a real deadline, the right statutory/contractual notice box ticked, a defensible tone, and proper service. The deliverable is a send-ready notice (or a review with fixes), not a threat that boxes the client in.

## When to use / not use

- Use: drafting a pre-action demand, letter before action, or a statutory/contractual notice; reviewing a draft before it goes out or a notice just received; confirming a mandatory notice requirement is met before filing.
- Hand off: the limitation/filing deadline calculation → `disputes/deadline-calendar`; the settlement/release if the demand resolves → `disputes/settlement-agreement`; the merits/strategy assessment → `disputes/early-case-assessment`; the contract-interpretation question behind the claim → `contracts/contract-review`; a regulator-facing response → `disputes/regulatory-investigation`.

## Inputs to collect first

1. The cause of action and the contract/statute relied on, with the key facts and dates.
2. The outcome sought (payment, performance, cease-and-desist, cure) and the realistic deadline.
3. Any **mandatory** notice requirement — a contractual notice/cure clause, a statutory pre-suit notice (e.g. India CPC s.80 against government; many statutes require a specific notice), or a pre-action protocol.
4. Limitation pressure and whether settlement is the real goal.
5. The correct recipient and the contract's **service/notice** clause (address, method).

## Method

1. **Confirm the legal basis before drafting a word.** State the cause of action and the right/obligation breached; a notice that misstates the basis hands the other side an easy rebuttal and can prejudice the claim.
2. **Check for a mandatory notice requirement and satisfy it.** A contractual notice-and-cure clause, a statutory pre-suit notice (India CPC **s.80** for suits against government; sector statutes), or a pre-action protocol can be a **precondition to suing** — getting the content, recipient, period or method wrong can delay or bar the claim `[verify current]`.
3. **State the facts crisply and accurately.** Enough to make the claim intelligible and to show it's serious; avoid overstating facts you can't prove — the letter can surface in court.
4. **Make a specific demand with a real deadline.** What must be done, by when, and in what form. Vague "contact us to discuss" demands lack force; an unrealistic deadline looks like bluster.
5. **State consequences proportionately.** The next step on non-compliance (proceedings, specific relief, interest, costs) — without threatening steps you won't take or that are improper (e.g. threatening criminal process to gain a civil advantage, or an unjustified groundless-threats claim in IP contexts).
6. **Set the privilege/posture.** Decide open vs **"without prejudice"** (or without prejudice save as to costs); a settlement overture usually goes without prejudice, a formal demand open — label it correctly, and don't mix.
7. **Mind limitation.** A notice does not stop the clock unless a rule/standstill says so; if limitation is near, the notice is not a substitute for filing → `disputes/deadline-calendar`.
8. **Get service right.** Use the contract's notice clause (recipient, address, method, deemed-receipt timing) or the statutory service rule; keep proof of dispatch and delivery.
9. **Calibrate tone.** Firm, professional, and leaving room to resolve — an aggressive letter can harden the dispute, breach a pre-action protocol's spirit, and read badly to a judge later.
10. **Score against the Checks table** and set a decision: **SEND-READY / SEND WITH CHANGES / DO NOT SEND (fix basis/notice)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Mandatory statutory/contractual notice requirement unmet | Correct content/recipient/period/method satisfied | S1 | Fix before sending; it can bar the suit `[verify current]` |
| Legal basis misstated or absent | Cause of action + right breached stated correctly | S1 | Correct the basis before it prejudices the claim |
| Improper threat (criminal leverage / groundless IP threat) | Only lawful, intended consequences stated | S1 | Remove the improper threat |
| Deadline missing or unrealistic | Specific, reasonable deadline + required form of compliance | S2 | Set a real deadline |
| Privilege posture wrong/mixed (open vs WP) | Correctly labelled; settlement vs demand separated | S2 | Re-label; split if needed |
| Facts overstated / unprovable assertions | Accurate, provable facts only | S2 | Trim to what's provable |
| Limitation treated as paused by the notice | Filing clock tracked independently | S1 | Protect the limitation date → `disputes/deadline-calendar` |
| Service clause/rule not followed | Correct recipient/method + proof kept | S2 | Serve per the clause; retain proof |
| Tone needlessly aggressive | Firm but protocol-compliant, resolution-open | S3 | Moderate the tone |

## Output

Lead with `Decision: SEND-READY | SEND WITH CHANGES | DO NOT SEND — <matter> — <key reason>`. Then the output contract. Add:

- **Basis & notice check**: cause of action + any mandatory notice requirement and whether it's satisfied.
- **The notice** (draft mode): basis · facts · demand · deadline · consequences · posture (open/WP) · service method.
- **Risk flags**: limitation, improper-threat, overstatement — each with the fix.
- One JSON finding per issue with `category: "legal-notice"`.

## Edge cases & pitfalls

- **Skipping a mandatory notice**: a statutory/contractual pre-suit notice done wrong (recipient, period, content) can get the eventual suit dismissed — check it first, not last.
- **Threats that backfire**: threatening criminal proceedings for a civil debt, or making groundless IP threats, can create fresh liability and sink credibility.
- **"Without prejudice" mislabelling**: a genuine settlement offer sent "open", or a demand marked WP, can be used against the sender — match the label to the purpose.
- **Notice ≠ stopped clock**: relying on a stern letter while limitation runs out is a classic, fatal error.
- **Overstated facts**: the letter is disclosable; exaggeration read back in court damages the case.

## References

- Volatile facts: `IN-COMM-01` where s.12A pre-institution mediation interacts with the demand. Cite `[verify current]` where a statutory notice period/recipient is load-bearing.
- The cause of action and governing contract/statute; mandatory pre-action/notice regimes (e.g. India CPC s.80, contractual notice clauses, UK pre-action protocols); without-prejudice privilege; service/notice rules.
