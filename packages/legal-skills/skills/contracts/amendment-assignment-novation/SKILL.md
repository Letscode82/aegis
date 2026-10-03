---
name: contracts-amendment-assignment-novation
description: >-
  Picks and drafts the right instrument to change who is bound or what the terms are — an amendment/variation, an
  assignment, or a novation — and checks it works: consent and anti-assignment clauses, consideration, whether
  obligations (not just benefits) must transfer, change-of-control triggers, and formalities. Use to transfer a
  contract, add/replace a party, or vary terms. Not for a full third-party contract review →
  contracts/contract-review; not for renewal/termination timing → contracts/renewal-termination-advisor.
module: contracts
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: goal
    required: true
    description: What needs to change — vary terms, transfer the contract to a new party, add/replace a party, or move obligations as well as rights.
  - name: contract
    required: false
    description: The existing contract, especially its assignment/novation, change-of-control, variation, and consent clauses, and the governing law.
  - name: parties
    required: false
    description: Who is transferring out/in, whether the counterparty will consent, and any group-reorganisation or M&A context.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/renewal-termination-advisor, contracts/redline-generator, corporate/ma-due-diligence, contracts/obligation-extraction]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Amendments, Assignment & Novation

Takes a "we need to change/transfer this contract" goal and returns the correct instrument — amendment, assignment or novation — with the consent, consideration and formality checks that make it actually bind the intended parties. The deliverable is the right instrument + a validity checklist, not a generic "sign an amendment".

## When to use / not use

- Use: transferring a contract to a new entity (sale, reorganisation, outsourcing); adding or replacing a party; varying terms; confirming whether a proposed change needs consent or re-signing.
- Hand off: a full risk review of a third-party contract → `contracts/contract-review`; renewal/termination windows and notice → `contracts/renewal-termination-advisor`; producing the marked-up text → `contracts/redline-generator`; acquisition-driven contract transfers at portfolio scale → `corporate/ma-due-diligence`; extracting the obligations that will move → `contracts/obligation-extraction`.

## Inputs to collect first

1. The actual goal: vary terms only, or change who is bound (and whether obligations as well as rights must move).
2. The contract's assignment / novation / change-of-control / variation / consent clauses, and the governing law.
3. Whether the counterparty will consent, and the commercial context (group reorg, M&A, outsourcing).

## Method

1. **Pick the instrument by what must change.**
   - **Amendment/variation** — same parties, changed terms.
   - **Assignment** — transfers *benefits* (rights) to a new party; the assignor generally **remains liable for the obligations** (burden doesn't pass by assignment).
   - **Novation** — replaces the old contract with a new one so a new party takes over **both rights and obligations** and the outgoing party is released; requires **all three parties' agreement**.
   Choosing assignment when the client wants to walk away from obligations is the classic error — only novation releases the burden.
2. **Check the anti-assignment / consent clause.** Many contracts bar or condition assignment (and sometimes novation / change of control). An assignment made in breach can be void or a default — get the required consent or use novation with the counterparty's agreement.
3. **Check change-of-control triggers.** A share sale can trip a change-of-control clause even with no formal transfer — map which contracts react to the deal structure → `corporate/ma-due-diligence`.
4. **Confirm obligations vs rights.** If performance obligations (not just payment rights) must move, assignment alone won't do it — use novation, or an assignment plus a sub-contract/delegation with the assignor staying liable.
5. **Consideration & formalities.** A variation generally needs consideration (or a deed where consideration is absent); a novation needs consideration or a deed; some contracts require variations **in writing and signed** (no-oral-modification clauses) — honour the contract's own formality rule. In India, watch stamping/registration where applicable `[verify current]`.
6. **Preserve security and ancillary terms.** Guarantees, security, and third-party rights can fall away on novation unless expressly confirmed — carry them across deliberately.
7. **Draft the instrument** with the operative transfer/variation, the effective date, consents/releases, a statement of what survives, and the formality (signed writing/deed) the contract and law require → `contracts/redline-generator`.
8. **Score against the Checks table** and set a decision: **VALID AS DRAFTED / VALID WITH CONDITIONS / WRONG INSTRUMENT (redo)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Assignment used where the client must shed obligations | Novation (3-party) used to release the burden | S1 | Switch to novation; get all-party agreement |
| Transfer in breach of an anti-assignment/consent clause | Required consent obtained or novation route | S1 | Get consent; an unconsented assignment may be void |
| Obligations assumed to pass by assignment | Burden moves only by novation/delegation | S1 | Correct the instrument |
| Change-of-control trigger missed on a share deal | CoC clauses mapped to the deal structure | S2 | Identify + address triggered contracts |
| No consideration / wrong formality (deed, signed writing) | Consideration or deed; contract's formality met | S2 | Re-paper as a deed / signed variation |
| No-oral-modification clause ignored | Variation in the required written form | S2 | Put it in signed writing |
| Security/guarantees not preserved on novation | Ancillary terms expressly confirmed | S2 | Add confirmation of security/guarantees |
| Stamping/registration missed (India) | Instrument stamped/registered as required | S2 | Stamp/register `[verify current]` |

## Output

Lead with `Decision: VALID AS DRAFTED | VALID WITH CONDITIONS | WRONG INSTRUMENT — <goal> — <key reason>`. Then the output contract. Add:

- **Instrument choice**: amendment vs assignment vs novation and why (rights vs obligations; release vs retain).
- **Validity checklist**: consent · consideration/formality · CoC · survival of security — status each.
- **Draft** (or redline brief) of the chosen instrument with effective date and consents.
- One JSON finding per issue with `category: "amendment-transfer"`.

## Edge cases & pitfalls

- **Assignment ≠ getting out**: the outgoing party stays on the hook for obligations after an assignment — only novation releases them.
- **Silent anti-assignment**: an assignment barred by the contract can be ineffective or a breach even if everyone acts on it — check the clause first.
- **No-oral-modification clauses**: an email "agreement" to vary may be unenforceable where the contract requires signed writing.
- **Novation drops security**: guarantees and security can be extinguished unless re-confirmed — a common, expensive oversight.
- **Change of control without a transfer**: a parent-level share sale can trigger CoC clauses with no document changing hands — map the deal, not just the paper.

## References

- Volatile facts: cite `[verify current]` where stamping/registration or a governing-law formality is load-bearing.
- General contract law on assignment vs novation (benefit vs burden), consent/anti-assignment clauses, consideration and deeds, no-oral-modification clauses; India Stamp Act / Registration Act where relevant.
