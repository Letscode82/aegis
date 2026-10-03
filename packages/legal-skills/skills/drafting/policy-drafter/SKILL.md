---
name: drafting-policy-drafter
description: >-
  Drafts or refreshes a corporate / internal policy — acceptable use, code of conduct, data protection, AI use,
  anti-bribery, information security, remote work — in a consistent house structure: purpose, scope, roles,
  rules, procedure, enforcement, review. Use to draft a new policy, modernise an old one, or harmonise a set into
  one template. Not for an employment policy tied to local labour law → employment/employment-policy-drafter; not
  for the privacy notice shown to data subjects → privacy/privacy-notice-drafter.
module: drafting
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: policy_type
    required: true
    description: Which policy to draft or review (e.g. acceptable use, code of conduct, AI use, information security, anti-bribery, data protection, remote work).
  - name: mode
    required: false
    description: One of draft (new policy), refresh (modernise an existing one) or harmonise (align a set to one house structure). Defaults to draft.
  - name: context
    required: false
    description: Organisation size/sector, jurisdictions, audience (all staff vs a function), the obligations the policy must implement, and any existing policy to build on.
  - name: house_style
    required: false
    description: Tone, reading level, defined-terms conventions, and approval/ownership metadata the organisation uses.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/employment-policy-drafter, privacy/privacy-notice-drafter, drafting/plain-language-explainer, regulatory/ai-governance, regulatory/anti-bribery, regulatory/whistleblower-programme]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Corporate Policy Drafter

Produces a clear, enforceable internal policy in a consistent house structure — one that a non-lawyer can follow, that maps to the obligation it implements, and that an auditor can trace. The deliverable is a ready-to-review policy plus a short rationale mapping each rule to its source obligation, not a generic template dump.

## When to use / not use

- Use: drafting a new internal policy; modernising a stale one; harmonising a scattered set of policies into one structure and voice; turning a legal/regulatory obligation into operable internal rules.
- Hand off: an employment-specific policy whose enforceability turns on local labour law → `employment/employment-policy-drafter`; the external privacy notice for data subjects → `privacy/privacy-notice-drafter`; explaining an existing dense policy in plain language → `drafting/plain-language-explainer`; the underlying AI-governance / anti-bribery / whistleblowing substance → `regulatory/ai-governance` / `regulatory/anti-bribery` / `regulatory/whistleblower-programme`.

## Inputs to collect first

1. The policy type and the obligation(s) it must implement (law, standard, contract, or internal risk).
2. Audience (all staff vs a specific function) and the jurisdictions the workforce sits in.
3. Any existing policy to refresh, and the house style/tone and ownership metadata.
4. The behaviours the organisation actually wants to require, permit and prohibit — the substance, not just the form.

## Method

1. **Anchor every rule to a source.** Before drafting, list what the policy must achieve: the specific legal/standard/contractual obligation or risk each section implements. A policy rule with no source is either missing a rationale or is unnecessary.
2. **Use the house structure** consistently: **Purpose · Scope (who/what/where) · Definitions · Roles & responsibilities · Policy rules · Procedure (how to comply) · Breach & enforcement · Related documents · Owner, approval & review date.** Keep section order identical across the policy set.
3. **Write rules as behaviours, not aspirations.** "You must…", "You must not…", "Before X, you must Y" — testable statements a person can follow and a manager can enforce. Avoid "endeavour to" and "where appropriate" for mandatory rules.
4. **Match reading level to the audience.** All-staff policies target a plain-language reading level; define terms once and use them consistently → `drafting/plain-language-explainer` for the readability pass.
5. **Separate policy from procedure.** The policy states the rule and why; the procedure states the steps. Mixing them makes both brittle — a step change should not require re-approving the whole policy.
6. **Make it enforceable.** State the consequence of breach, the reporting route, and the interaction with disciplinary process — without over-promising a specific sanction the organisation may not apply uniformly.
7. **Add the governance metadata**: owner, approver, effective date, version, and a review cadence. A policy with no owner and no review date rots.
8. **Cross-reference, don't duplicate.** Point to the related policy/standard rather than restating it — duplication drifts the moment one copy changes.
9. **Flag jurisdictional and local-law dependencies** where the global policy must bend (consultation requirements, local addenda) → hand off employment-law-sensitive parts.
10. **Score the draft** against the Checks table and set a decision: **READY FOR REVIEW / READY WITH CONDITIONS / NOT READY**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| A rule with no source obligation / rationale | Each section maps to a named obligation or risk | S2 | Add the source or cut the rule |
| Mandatory rules written as aspirations | Testable "must / must not" statements | S2 | Rewrite to enforceable language |
| Policy and procedure conflated | Rule (policy) separated from steps (procedure) | S2 | Split; reference the procedure |
| Scope ambiguous (who/what/where) | Explicit scope + exclusions | S2 | Define scope precisely |
| No owner / approver / review date | Governance metadata present | S2 | Add ownership + review cadence |
| Reading level too dense for the audience | Plain language for all-staff policies | S3 | → `drafting/plain-language-explainer` |
| Duplicates content from another policy | Cross-reference instead of restating | S3 | Replace copy with a pointer |
| Local-law dependency ignored | Jurisdictional carve-outs/addenda flagged | S2 | Flag + hand off the local-law parts |
| No breach/enforcement/reporting route | Consequence + reporting route stated | S3 | Add enforcement + reporting section |

## Output

Lead with `Status: READY FOR REVIEW | READY WITH CONDITIONS | NOT READY — <policy> — <key reason>`. Then the output contract. Add:

- **The policy** in the house structure (all sections), ready to paste into the organisation's template.
- **Rule-to-source map**: each policy section → the obligation/risk it implements.
- **Open points**: decisions the owner must make (thresholds, sanctions, local addenda), and any jurisdictional hand-offs.
- One JSON finding per gap/open point with `category: "policy"`.

## Edge cases & pitfalls

- **Template dumping**: a generic policy that doesn't reflect what the organisation actually does is unenforceable and ignored — anchor it to real behaviours and obligations.
- **Over-specific sanctions**: committing to a fixed disciplinary outcome can bind the organisation unfairly; state that breach may lead to disciplinary action per the relevant process.
- **Policy sprawl**: ten overlapping policies are worse than three clear ones; prefer harmonising to adding.
- **Stale cross-references**: pointing to a renamed/retired document breaks the chain — verify related-document links.
- **Employment-law traps**: work-rule policies can create contractual or consultation obligations in some jurisdictions — hand those parts to the employment skill rather than asserting global enforceability.

## References

- Volatile facts: cite live where a policy implements a dated legal obligation; mark `[verify current]`.
- Standard corporate-policy structure and plain-language drafting practice; the source obligation for the specific policy type (e.g. GDPR, Bribery Act, ISO 27001, AI-governance guidance) via the related skills.
