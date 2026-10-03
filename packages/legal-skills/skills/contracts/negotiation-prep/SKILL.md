---
name: contracts-negotiation-prep
description: >-
  Prepares for a contract or dispute negotiation: the parties' underlying interests (not just positions), each side's
  BATNA and walk-away, the issue list ranked by value, the trade-offs and concession sequence, and the opening/target
  on each point. Use before negotiating a deal, a renewal, or a settlement to go in with a plan rather than reacting.
  Not for drafting the resulting edits → contracts/redline-generator; not for the settle-vs-fight merits call →
  disputes/early-case-assessment.
module: contracts
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: negotiation
    required: true
    description: What is being negotiated (new deal / renewal / dispute settlement / amendment), the counterparty, and the outcome the client wants.
  - name: position
    required: false
    description: Our side's priorities and constraints, our leverage and alternatives (BATNA), any authority limits, and the deadline.
  - name: counterparty
    required: false
    description: What is known of the other side's interests, pressures, alternatives and likely red lines.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/redline-generator, contracts/contract-review, contracts/renewal-termination-advisor, disputes/early-case-assessment, disputes/settlement-agreement]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Negotiation Preparation

Takes a negotiation and returns a plan: the real interests on both sides, the walk-away points, the ranked issue list, and a concession sequence that trades low-value points for high-value ones. The deliverable is a negotiation playbook — openings, targets, trades, and red lines — not a wish-list of asks.

## When to use / not use

- Use: preparing for any contract, renewal, or settlement negotiation; building the issue list and concession plan; working out the client's walk-away and the other side's likely one; briefing the negotiator before the table.
- Hand off: turning the agreed changes into drafted clause edits → `contracts/redline-generator`; the underlying risk review that identifies the issues → `contracts/contract-review`; the renew/renegotiate/exit decision and deadline math → `contracts/renewal-termination-advisor`; the settle-or-fight merits/quantum call → `disputes/early-case-assessment`; papering the settlement once terms are agreed → `disputes/settlement-agreement`.

## Inputs to collect first

1. **What** is being negotiated and the **outcome** the client actually wants (the interest, not the opening demand).
2. Our **priorities and constraints**, **authority limits**, and the **deadline**.
3. Our **BATNA** (best alternative to a negotiated agreement) — the real alternative if this fails — and an estimate of the counterparty's.
4. What's known about the **other side's** interests, pressures, and likely red lines.

## Method

1. **Separate interests from positions.** For each side, write the underlying *interest* (why they want it) beneath the stated *position* — deals unlock when a position is traded for a different way of meeting the same interest.
2. **Establish both BATNAs and the walk-away.** Define our real alternative if we don't agree, and set the **walk-away point** (the terms below which the BATNA is better). Estimate the counterparty's BATNA — negotiating power is the gap between the deal and each side's alternative.
3. **Build and rank the issue list by value.** List every issue; tag each **must-have / important / tradeable / nice-to-have** and note what it's worth to each side. Asymmetries (cheap for us, valuable to them) are the currency of a good trade.
4. **Set opening, target and reservation per issue.** An ambitious-but-justifiable opening, a realistic target, and the point past which we walk — with the rationale that makes the opening credible.
5. **Plan the concession sequence.** Decide the order and pairing of concessions: give ground on tradeables **in exchange** for must-haves, never unilaterally; keep a few planned concessions in reserve for the close.
6. **Prepare the rationale and framing.** For each ask, the one-line justification pitched to the other side's interest (reciprocity, market standard, risk allocation) — framing, not just demanding, is what moves them.
7. **Anticipate their moves and your responses.** Their likely openings, objections and tactics, and the prepared response to each; identify any information to probe for and any you won't disclose.
8. **Fix authority, process and record.** Who has authority to agree what, the escalation path, the without-prejudice posture for a settlement, and how agreement will be recorded → `contracts/redline-generator` / `disputes/settlement-agreement`.
9. **Score against the Checks table** and present the playbook with the walk-away and top trades at the front.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Positions listed without interests | Underlying interest written for each position | S2 | Add the "why" behind each ask |
| No walk-away / reservation point set | Walk-away defined against the BATNA | S1 | Set it before negotiating |
| BATNA unknown (ours and theirs) | Both alternatives assessed | S1 | Work out the alternatives |
| Issues unranked by value | Must/important/tradeable/nice tiers assigned | S2 | Rank and value the issues |
| Concessions planned as unilateral give-aways | Each concession paired with an ask | S2 | Re-plan trades, not gifts |
| No opening/target/reservation per issue | Three numbers per issue with rationale | S2 | Set the range per point |
| Counterparty moves not anticipated | Likely tactics + prepared responses | S3 | Add the response plan |
| Authority / process unclear | Authority limits + record method set | S2 | Fix authority and how it's papered |
| Framing is demand-only | Interest-based rationale per ask | S3 | Add the counterparty-facing why |

## Output

Lead with `Negotiation plan: <subject> — walk-away: <the line> — top trade: <give X for Y>`. Then the output contract. Add:

- **Interests & BATNAs**: each side's interests, alternatives, and our walk-away.
- **Issue grid**: issue · tier · value-to-each · opening · target · reservation · rationale.
- **Concession plan**: the sequence and the pairings.
- **Their moves**: anticipated tactics and prepared responses.
- One JSON finding per high-stakes issue or red line with `category: "negotiation"`.

## Edge cases & pitfalls

- **Arguing positions**: haggling over stated positions without surfacing interests misses the trades that actually close the gap.
- **No walk-away**: without a reservation point tied to the BATNA, the negotiator can't tell a good deal from a bad one and gets anchored by the other side.
- **Unilateral concessions**: giving ground without getting something signals weakness and trains the counterparty to keep pushing — pair every concession.
- **Ignoring their BATNA**: over-demanding when the other side has a strong alternative collapses the deal; under-asking when they have none leaves value on the table.
- **Winging authority**: agreeing beyond actual authority, or discovering mid-table that sign-off is needed elsewhere, derails the close — fix authority first.

## References

- Volatile facts: generally none; cite `[verify current]` only where a negotiating point turns on a dated legal position.
- Interest-based negotiation and BATNA framework; the deal/dispute's own facts, the client's constraints, and (for settlements) the without-prejudice posture.
