---
name: contracts-redline-generator
description: >-
  Turns a contract review into concrete redlines: for each issue, a proposed edit to the clause (replace / insert /
  delete), a fallback position, and a one-line rationale and ask for the counterparty — organised into a markup the
  business and the other side can act on. Use to convert review findings or a playbook into drafted changes, or to
  prioritise a redline by leverage. Not for the risk analysis itself → contracts/contract-review; not for choosing an
  amendment vs novation → contracts/amendment-assignment-novation.
module: contracts
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: document
    required: true
    description: The contract (or the specific clauses) to redline, ideally with the review findings or the playbook positions to apply.
  - name: posture
    required: false
    description: Which side we act for, our leverage, and whether this is first-markup (push hard) or a late-round compromise (narrow to must-haves).
  - name: playbook
    required: false
    description: Any standard positions / fallbacks to apply (clause playbook, prior precedents) so the redline matches house standards.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/amendment-assignment-novation, contracts/saas-and-cloud-review, contracts/nda-triage, contracts/obligation-extraction]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Redline Generator

Converts review findings (or a clause playbook) into a usable markup: per issue, the exact edit, a pre-agreed fallback, and the one-line rationale the counterparty needs — ordered so the business knows what to fight for and what to trade. The deliverable is an actionable redline package, not a re-run of the risk review.

## When to use / not use

- Use: turning a contract review or a set of findings into drafted changes; applying a clause playbook's positions as edits; prioritising a markup by leverage; preparing the "what we're asking and why" note for the counterparty.
- Hand off: the underlying risk analysis / issue-spotting → `contracts/contract-review` (or the specialised `contracts/saas-and-cloud-review`, `contracts/nda-triage`); choosing the right change instrument (amendment vs assignment vs novation) → `contracts/amendment-assignment-novation`; extracting obligations to track post-signature → `contracts/obligation-extraction`.

## Inputs to collect first

1. The contract (or clauses) and the findings/positions to apply — this skill drafts edits, it does not re-discover the issues.
2. Our side and leverage, and whether this is the first markup (push to the ideal) or a later round (narrow to must-haves).
3. Any house playbook/precedents so the language matches standards rather than being invented per deal.

## Method

1. **Work from findings, not from scratch.** Each redline must map to a specific issue and its severity; if the issue list is missing, get it first → `contracts/contract-review`. A redline with no rationale is noise the counterparty will reject.
2. **For each issue, draft the edit as an operation** on the clause: **replace** (with the new wording), **insert** (new clause/subclause, placed), or **delete** (with a reason). Quote the original and give the exact proposed text so the change is unambiguous.
3. **Pair every edit with a fallback.** State the ideal position and the acceptable compromise (and the walk-away where there is one), so the negotiator can concede in a controlled way without re-opening the file.
4. **Write a one-line rationale and ask per edit** — why we need it, pitched to the counterparty (risk allocation, reciprocity, market standard), not internal jargon. This is what unlocks acceptance.
5. **Prioritise by leverage and impact.** Tag each edit **must-have / important / nice-to-have**. On a late round, drop the nice-to-haves to protect the must-haves; don't send a 40-point markup when five points matter.
6. **Keep internal consistency.** A change to one clause (definitions, liability, termination) often requires conforming edits elsewhere — flag the knock-on edits so the document stays coherent.
7. **Preserve defined terms and cross-references.** Use the contract's defined terms; if you introduce a concept, define it; fix any cross-reference a deletion/insertion breaks.
8. **Match the drafting voice** to the document (same numbering, style, tense) so the markup reads as part of the contract, not a bolt-on.
9. **Flag anything that needs a decision**, not a default — a commercial point (price, term length) is the business's call; present the edit as an option with the trade-off.
10. **Score the package** against the Checks table and set a posture: **READY TO SEND / READY WITH DECISIONS NEEDED / NOT READY (missing findings/positions)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Redline with no mapped issue/rationale | Every edit maps to a finding + one-line why | S2 | Add the rationale or cut the edit |
| Edit not drafted as exact operative text | Replace/insert/delete with precise wording | S2 | Draft the exact clause text |
| No fallback on a contested edit | Ideal + acceptable compromise stated | S2 | Add the fallback position |
| Knock-on/conforming edits missed | Related clauses updated for consistency | S2 | Add the conforming edits |
| Broken cross-reference / undefined term introduced | References fixed; new terms defined | S2 | Repair references; define terms |
| Everything flagged must-have (no prioritisation) | Must/important/nice tiers assigned | S3 | Re-tier by leverage/impact |
| Commercial decision defaulted without the business | Decision points surfaced as options | S2 | Present the trade-off for sign-off |
| Markup style mismatched to the document | Same numbering/style/voice | S3 | Conform the drafting style |

## Output

Lead with `Status: READY TO SEND | READY WITH DECISIONS NEEDED | NOT READY — <contract> — <key reason>`. Then the output contract. Add:

- **Redline table**: clause · original (quoted) · proposed edit (operative text) · operation (replace/insert/delete) · fallback · priority · one-line ask.
- **Decisions needed**: the commercial points for the business to choose.
- **Conforming-edits note**: the knock-on changes made for consistency.
- One JSON finding per edit with `category: "redline"` (carrying the issue's severity).

## Edge cases & pitfalls

- **Redlining without the analysis**: generating edits without the issue list produces plausible-but-unjustified changes the counterparty bats away — findings first.
- **No fallback = stalled negotiation**: an ideal-only markup forces binary accept/reject; the fallback is what lets a deal close.
- **Kitchen-sink markup**: a huge list of trivial edits buries the few that matter and signals inexperience — prioritise ruthlessly.
- **Orphaned cross-references**: deleting a clause without fixing references to it breaks the contract; always sweep for knock-on effects.
- **Silently making a commercial call**: changing price/term/scope is the business's decision — present it, don't bake it in.

## References

- Volatile facts: cite `[verify current]` only where a proposed clause depends on a dated legal position.
- The source review's findings/playbook positions; standard risk-allocation drafting; the contract's own defined terms and style.
