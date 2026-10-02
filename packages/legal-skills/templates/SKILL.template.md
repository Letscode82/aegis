---
name: <module>-<skill-name>            # kebab-case, unique, matches folder: skills/<module>/<skill-name>/
description: >-                        # ≤ 600 chars. WHAT it does + WHEN to use it (trigger phrases). This is what the router matches on.
  <One sentence on what it produces.> Use when <situations / phrases>. Not for <near-miss cases → other skill id>.
module: <module id from catalog/catalog.json>
version: 1.0.0
jurisdictions: [global]                # or [IN], [EU, UK], …
risk_tier: review-required             # review-required | self-serve | internal
inputs:                                # what the caller should supply; mark optional ones
  - name: document
    required: true
    description: <…>
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: []                            # other skill ids to hand off to
last_reviewed: 2026-10-02
license: Apache-2.0
---

# <Title>

<One paragraph: the job this skill does and the outcome the user gets.>

## When to use / not use

- Use: …
- Hand off: … → `<module>/<skill>`

## Inputs to collect first

Ask only for what is missing and material. List the minimum facts that change the analysis.

## Method

Numbered steps. Each step says what to check and what decision it drives. Prefer decision rules ("if X, then S2 unless Y") over descriptions.

## Checks / issue list

The domain-specific checklist, ideally as a table: issue · what good looks like · default severity · fallback.

## Output

What to return, following `_shared/output-contract.md`, plus any skill-specific section.

## Edge cases & pitfalls

Things that commonly go wrong.

## References

- `references/<file>.md` (optional, for long checklists or jurisdiction packs)
- Volatile facts: cite IDs from `_shared/volatile-facts.md`
