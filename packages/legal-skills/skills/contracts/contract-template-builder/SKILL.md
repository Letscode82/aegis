---
name: contracts-contract-template-builder
description: >-
  Builds a new standard contract template with its guidance notes and negotiation playbook: the clause architecture
  and defined terms, drafting/optional-variant notes, the fallback positions and walk-aways per key clause, and the
  governance (version, owner, review cadence) so it stays house standard. Use to create or overhaul a reusable
  template. Not for drafting one clause → contracts/clause-drafter; not for reviewing a specific third-party contract
  → contracts/contract-review.
module: contracts
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: template
    required: true
    description: The contract type to templatise (NDA, MSA, SOW, DPA, supply, SaaS, employment, etc.) and the side it is written for.
  - name: context
    required: false
    description: The typical deals it will cover, the house positions/risk appetite, the governing law(s), and any existing precedents to consolidate.
  - name: scope
    required: false
    description: Whether a full template + playbook is needed or just the clause architecture, and who will own/maintain it.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/clause-drafter, contracts/contract-review, contracts/redline-generator, contracts/negotiation-prep, contracts/obligation-extraction]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Contract Template Builder

Takes a contract type and returns a reusable standard template with the guidance and negotiation playbook that make it usable by non-experts and consistent across deals: clause architecture, drafting notes, optional variants, fallbacks per key clause, and the governance to keep it current. The deliverable is a template + playbook, not a one-off agreement.

## When to use / not use

- Use: creating a new standard template or overhauling an old one; consolidating scattered precedents into one house standard; building the guidance notes and negotiation playbook that ship with a template.
- Hand off: drafting or adapting a single clause → `contracts/clause-drafter`; reviewing a specific inbound third-party contract → `contracts/contract-review`; producing a markup of a specific deal → `contracts/redline-generator`; preparing for a specific negotiation → `contracts/negotiation-prep`; extracting obligations from a signed instance → `contracts/obligation-extraction`.

## Inputs to collect first

1. The **contract type** and the **side** it's written for (buyer/seller, discloser/recipient).
2. The **typical deals** it covers and the **house positions / risk appetite**.
3. The **governing law(s)** and jurisdictions it must serve.
4. Any **existing precedents** to consolidate and who will **own/maintain** it.

## Method

1. **Fix the clause architecture.** Lay out the full clause set for the type (parties, definitions, scope, commercials, the risk-allocation core — liability, indemnity, IP, confidentiality, data protection — term/termination, boilerplate), in a logical order with consistent numbering and a single defined-terms section.
2. **Draft each clause to the house position with variants.** Write the standard (preferred) version and mark **optional/alternative variants** (e.g. mutual vs one-way, with/without a liability cap carve-out) so the drafter selects rather than rewrites → `contracts/clause-drafter`.
3. **Write guidance notes inline.** For each non-trivial clause, a short note: what it does, when to use which variant, what to fill in, and what *not* to change without legal sign-off. The notes are what let a non-lawyer use the template safely.
4. **Build the negotiation playbook.** Per key clause: the **ideal / acceptable / walk-away** positions and the one-line rationale, so negotiators concede in a controlled way → `contracts/negotiation-prep`. Mark which clauses are **non-negotiable** (legal/compliance red lines) vs tradeable.
5. **Mark approval gates.** Flag the clauses/changes that require legal or business sign-off (deviations beyond the fallback, unusual indemnities, data terms) so the template self-polices.
6. **Ensure internal consistency.** Defined terms used consistently, cross-references correct, cap/indemnity/insurance aligned, and no orphaned placeholders — a template's inconsistencies propagate into every deal that uses it.
7. **Check governing-law fit and modularity.** Flag jurisdiction-specific variants (mandatory terms, enforceability of caps/penalties, consumer rules) and keep them modular so the template localises cleanly `[verify current]`.
8. **Add governance.** Version number, owner, effective date, change log, and a **review cadence** (and a trigger to review on relevant law changes) — a template with no owner rots.
9. **Score against the Checks table** and output the template + guidance notes + playbook + governance block.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Clause architecture incomplete | Full standard clause set + logical order | S1 | Add the missing clauses |
| No optional variants (forces rewriting) | Standard + marked alternative variants | S2 | Add selectable variants |
| Guidance notes missing | Inline note per non-trivial clause | S1 | Write the drafting notes |
| No negotiation playbook / fallbacks | Ideal/acceptable/walk-away per key clause | S1 | Build the playbook |
| Non-negotiables / approval gates unmarked | Red lines + sign-off triggers flagged | S2 | Mark the gates |
| Internal inconsistency / orphan placeholders | Defined terms + cross-refs + cap/indemnity aligned | S1 | Reconcile the template |
| No jurisdiction modularity | Law-specific variants flagged + modular | S2 | Modularise localisation `[verify current]` |
| No governance (owner/version/review) | Version + owner + review cadence set | S2 | Add the governance block |

## Output

Lead with `Template: <type> (<side>) — <n clauses>, playbook: ready`. Then the output contract. Add:

- **Architecture**: the clause set and order, defined-terms section.
- **Clauses + variants**: standard versions with marked alternatives.
- **Guidance notes**: the inline drafting/use notes.
- **Negotiation playbook**: ideal/acceptable/walk-away per key clause + non-negotiables.
- **Governance**: version · owner · review cadence · jurisdiction variants.
- One JSON finding per gap/inconsistency with `category: "template-build"`.

## Edge cases & pitfalls

- **Template without notes**: a bare template with no guidance gets misused by non-lawyers — the notes and approval gates are what make it safe to delegate.
- **No playbook = every deal re-litigated**: without fallbacks and non-negotiables, each negotiator improvises and house positions drift — ship the playbook with the template.
- **Propagated inconsistency**: an orphan placeholder or a cap/indemnity mismatch in the template repeats in every contract made from it — reconcile before release.
- **Monolithic for all jurisdictions**: a single non-modular template forces either over-reach or non-compliance abroad — keep localisation modular.
- **Unowned template**: no owner/version/review means it silently goes stale against the law — governance is part of the deliverable.

## References

- Volatile facts: cite `[verify current]` where a clause's enforceability or a mandatory term for the type/jurisdiction is load-bearing.
- The house precedents and risk positions being consolidated; standard drafting architecture for the contract type; the governing law(s) it must serve.
