---
name: contracts-renewal-termination-advisor
description: >-
  Decides renew / renegotiate / exit ahead of a contract's notice deadline, and sets out the exit mechanics: the
  auto-renewal and notice-window math, termination rights (for cause / convenience / change of law), the consequences
  of letting it roll, wind-down and transition obligations, and the drop-dead date to act by. Use before a renewal or
  notice deadline, or when considering exit. Not for the full risk review of the contract → contracts/contract-review;
  not for choosing an amendment vs novation instrument → contracts/amendment-assignment-novation.
module: contracts
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of decide (renew/renegotiate/exit recommendation), deadline-check (compute the notice window and drop-dead date) or exit-plan (map termination route + wind-down).
  - name: contract
    required: false
    description: The contract, especially its term, auto-renewal, notice, termination (cause/convenience), and post-termination/transition clauses, and the governing law.
  - name: context
    required: false
    description: Whether the relationship is working, commercial pressures (price, performance, dependency), today's date, and any replacement/alternative lined up.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/amendment-assignment-novation, contracts/negotiation-prep, contracts/obligation-extraction, disputes/legal-notice-drafter]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Renewal & Termination Advisor

Takes a contract approaching a renewal or notice deadline and returns a decision — renew, renegotiate, or exit — with the deadline math and the exit mechanics worked out, so the client acts *before* the window closes rather than discovering an auto-renewal after it has rolled. The deliverable is a dated recommendation with a drop-dead date, not a general comment on the contract.

## When to use / not use

- Use: a renewal/auto-renewal date is approaching; deciding whether to keep, renegotiate, or exit a contract; computing the notice window and the last date to act; planning a clean exit with wind-down and transition.
- Hand off: the full issue-spotting risk review of the contract → `contracts/contract-review`; choosing/drafting the instrument to transfer or vary → `contracts/amendment-assignment-novation`; preparing the renegotiation asks and leverage → `contracts/negotiation-prep`; extracting the surviving post-termination obligations → `contracts/obligation-extraction`; drafting the actual termination/non-renewal notice letter → `disputes/legal-notice-drafter`.

## Inputs to collect first

1. The **term, auto-renewal and notice clauses** — initial term, renewal period, notice period and the exact form/recipient of notice.
2. Today's date and the next renewal date, to compute the window.
3. The **termination rights** — for cause, for convenience (and any fee/lock-in), for change of law/insolvency — and any minimum commitment.
4. The commercial picture: is the relationship working, what's the dependency/switching cost, is a replacement lined up.
5. The **post-termination** obligations: transition/exit assistance, data return/deletion, run-off, survival clauses.

## Method

1. **Compute the notice window first.** Work back from the renewal date by the notice period to the **drop-dead date** — the last day to serve non-renewal/termination. State it explicitly and prominently; a missed window is the single most common and expensive failure.
2. **Establish what happens on silence.** Does the contract **auto-renew** (and for how long, on what terms, with what price escalator) or expire? Letting an unwanted contract roll locks in another term — know the default before deciding.
3. **Map the exit routes.** Termination **for convenience** (notice + any fee/lock-in), **for cause** (breach + cure mechanics), and special rights (change of law, insolvency, change of control). Pick the cleanest route for the goal.
4. **Decide renew / renegotiate / exit.** Weigh relationship performance, price trajectory, dependency/switching cost, and alternatives. A renewal date is leverage — even a "renew" often warrants a renegotiation ask → `contracts/negotiation-prep`.
5. **Cost the exit.** Early-termination fees, remaining minimum commitments, unamortised charges, and the cost/time to stand up a replacement — an "exit" that triggers a large fee may not be worth it.
6. **Plan the wind-down.** Transition/exit-assistance obligations, data return/deletion, IP and licence tail, run-off insurance, and the survival clauses that outlive termination — so the exit doesn't strand the business.
7. **Serve notice correctly.** Use the contract's notice clause (recipient, method, deemed-receipt) and keep proof; an informal or mis-served notice can be ineffective → `disputes/legal-notice-drafter`.
8. **Set the action calendar.** Drop-dead date, internal decision date (with buffer), and the notice-service date — with owners.
9. **Score against the Checks table** and set a recommendation: **RENEW / RENEGOTIATE / EXIT**, with the drop-dead date and the route.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Notice window not computed / drop-dead date missing | Drop-dead date stated prominently | S1 | Compute it now; diarise with buffer |
| Auto-renewal default unknown | Renew-on-silence behaviour confirmed | S1 | Read the term/renewal clause |
| Wrong/ineffective termination route chosen | For-cause vs convenience vs special right matched | S2 | Select the route that achieves the goal |
| Early-termination fee / lock-in not costed | Exit cost + remaining commitment quantified | S2 | Price the exit before deciding |
| Post-termination/transition obligations ignored | Wind-down, data, IP, run-off mapped | S2 | Build the exit plan |
| Notice mis-served (recipient/method/timing) | Contract's notice clause followed + proof kept | S1 | Serve per the clause → notice drafter |
| Renewal treated as admin, not leverage | Renegotiation ask considered | S3 | Prepare the ask → negotiation-prep |
| Survival clauses overlooked | Clauses surviving termination identified | S3 | List what survives |
| No action calendar / owners | Decision + notice dates assigned | S2 | Set the calendar with owners |

## Output

Lead with `Recommendation: RENEW | RENEGOTIATE | EXIT — <contract> — act by <drop-dead date>`. Then the output contract. Add:

- **Deadline math**: renewal date · notice period · **drop-dead date** · auto-renew-on-silence behaviour.
- **Exit route**: the termination right relied on + its mechanics (cure, fee, lock-in).
- **Exit cost**: fees, remaining commitment, replacement cost/time.
- **Wind-down**: transition, data, IP, run-off, survival.
- **Action calendar**: decision / notice-service dates with owners.
- One JSON finding per issue with `category: "renewal-termination"`.

## Edge cases & pitfalls

- **Evergreen auto-renewal**: a short notice window on an evergreen contract means silence renews it for another full term — the drop-dead date is everything.
- **"For convenience" isn't free**: convenience termination can carry a fee, a lock-in, or a minimum-commitment payout — cost it before pulling the trigger.
- **Exit that strands the business**: terminating without securing transition assistance / data return leaves the business unable to switch — plan the wind-down first.
- **Mis-served notice**: a notice to the wrong address or by the wrong method can be void, missing the window even though the client "sent it".
- **Cause without cure**: terminating for breach without following the cure-period mechanics can convert the exit into your own repudiation.

## References

- Volatile facts: generally none; cite `[verify current]` only where a statutory termination-notice or consumer auto-renewal rule is load-bearing.
- The contract's term/renewal/notice/termination/survival clauses and governing law; general contract law on notice, repudiation, and post-termination obligations.
