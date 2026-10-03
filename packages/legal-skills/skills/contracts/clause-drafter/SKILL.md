---
name: contracts-clause-drafter
description: >-
  Drafts or adapts a single clause from an approved clause library: pick the right variant for the position and
  leverage, adapt it to this deal's defined terms and facts, keep it internally consistent, and give the rationale and
  fallback. Use to produce one clause (indemnity, liability cap, termination, confidentiality, etc.) to house standard.
  Not for turning a whole review into a markup → contracts/redline-generator; not for building a new template from
  scratch → contracts/contract-template-builder.
module: contracts
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: clause
    required: true
    description: Which clause is needed (indemnity, limitation of liability, termination, confidentiality, IP, data protection, etc.) and the position wanted.
  - name: library
    required: false
    description: The approved clause library / precedents to draw the variant from, including any house fallbacks.
  - name: deal
    required: false
    description: The contract's defined terms, governing law, the parties and leverage, and the specific facts the clause must fit.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/redline-generator, contracts/contract-template-builder, contracts/contract-review, contracts/obligation-extraction, contracts/negotiation-prep]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Clause Drafter from Library

Takes a clause need and an approved library and returns the right variant, adapted to this deal and internally consistent, with the rationale and fallback. The deliverable is a drop-in clause that matches house standard and the contract's own terms, not an invented-from-scratch paragraph.

## When to use / not use

- Use: drafting or adapting one clause to house standard; selecting the right library variant for the position/leverage; conforming a precedent clause to this contract's defined terms and governing law.
- Hand off: converting a full review's findings into a multi-point markup → `contracts/redline-generator`; building a whole new standard template + playbook → `contracts/contract-template-builder`; the risk review that decides *which* positions to take → `contracts/contract-review`; extracting obligations the clause creates → `contracts/obligation-extraction`; preparing the negotiation around the clause → `contracts/negotiation-prep`.

## Inputs to collect first

1. **Which clause** and the **position** wanted (protective vs balanced vs aggressive).
2. The **approved library / precedents** and any house **fallbacks** for that clause.
3. The contract's **defined terms, governing law, parties and leverage**, and the specific facts the clause must fit.

## Method

1. **Draw from the library, don't invent.** Start from the approved variant that matches the clause and position; a bespoke clause written from scratch drifts from house standard and loses the vetting the library carries. If no variant fits, say so and flag for the template owner rather than improvising silently.
2. **Pick the variant by position and leverage.** Choose protective / balanced / aggressive to match the deal and side; note the house **fallback** so the negotiator has a controlled climb-down → `contracts/negotiation-prep`.
3. **Adapt to this contract's defined terms.** Replace placeholders with the contract's actual defined terms (don't introduce a synonym for a term already defined), align numbering/style, and fit the clause to the specific facts (parties, amounts, periods).
4. **Keep it internally consistent.** Check the clause against related clauses (a liability cap must line up with the indemnity and insurance; a termination right with the term and notice provisions) and flag any conforming edits needed elsewhere.
5. **Respect governing law.** Confirm the variant is appropriate for the governing law (e.g. penalty vs liquidated-damages treatment, limitation-of-liability enforceability, mandatory consumer terms) and flag where a jurisdiction-specific version is required `[verify current]`.
6. **Give the rationale and the ask.** A one-line why for the clause (risk allocation, market standard) pitched for the counterparty, plus the fallback — so it's usable in negotiation, not just dropped in.
7. **Flag decisions, don't bury them.** Where the clause encodes a commercial choice (cap amount, term length, carve-outs), surface it as a decision for the business rather than defaulting silently.
8. **Score against the Checks table** and output the clause + variant choice + fallback + rationale.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Clause invented instead of from library | Approved variant used; gaps flagged to owner | S2 | Use the library / flag the gap |
| Wrong variant for position/leverage | Variant matched to side + deal | S2 | Re-select the variant |
| Defined terms not conformed | Contract's own defined terms used | S1 | Replace placeholders; avoid synonyms |
| Internal inconsistency with related clauses | Cap/indemnity/insurance/termination aligned | S2 | Add conforming edits |
| Governing-law fit not checked | Variant appropriate for the law | S2 | Use the jurisdiction-specific version `[verify current]` |
| No fallback provided | House fallback stated | S2 | Add the climb-down |
| Rationale/ask missing | One-line counterparty-facing why | S3 | Add the rationale |
| Commercial choice defaulted silently | Decision surfaced for the business | S2 | Surface the decision |

## Output

Lead with `Clause: <name> — variant: <protective/balanced/aggressive> — <deal>`. Then the output contract. Add:

- **The clause**: operative text, conformed to the contract's defined terms/style.
- **Variant & fallback**: which variant and the house fallback position.
- **Consistency note**: any conforming edits needed in related clauses.
- **Rationale & decisions**: the one-line why + any commercial choice to confirm.
- One JSON finding per consistency/decision issue with `category: "clause-draft"`.

## Edge cases & pitfalls

- **Inventing off-library**: a from-scratch clause loses the library's vetting and drifts from house standard — draw from the approved variant, and flag a genuine gap to the template owner.
- **Synonym for a defined term**: introducing "the Information" when the contract defines "Confidential Information" creates ambiguity — reuse the defined term.
- **Cap/indemnity mismatch**: a liability cap that doesn't line up with the indemnity or insurance leaves a gap or an inconsistency — check related clauses.
- **Wrong-law variant**: a penalty-style liquidated-damages clause or an over-broad liability exclusion may be unenforceable under the governing law — use the right version.
- **Silent commercial default**: baking in a cap amount or term length that's really the business's call hides a decision — surface it.

## References

- Volatile facts: cite `[verify current]` where a clause's enforceability (penalties, liability exclusions, consumer terms) turns on the governing law.
- The approved clause library / house precedents; the contract's defined terms and governing law; standard risk-allocation drafting.
