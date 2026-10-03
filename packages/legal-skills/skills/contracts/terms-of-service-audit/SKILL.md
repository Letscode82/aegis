---
name: contracts-terms-of-service-audit
description: >-
  Audits customer-facing online terms (ToS/EULA) and the related notices for enforceability and consumer-law
  compliance: formation/assent (clickwrap vs browsewrap), unfair-terms and one-sided clauses, mandatory consumer
  rights (cancellation, refunds, auto-renewal disclosure, liability limits that don't bind consumers), platform/app-
  store rules, and required linked policies (privacy, cookies). Use to review or draft B2C/B2B terms. Not for a
  negotiated bilateral contract review → contracts/contract-review; not for the privacy notice itself →
  privacy/privacy-notice-drafter.
module: contracts
version: 1.0.0
jurisdictions: [global, IN, EU]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of audit (review existing terms), draft (produce terms for a product) or assent-check (assess whether the terms are validly formed/binding).
  - name: product
    required: false
    description: The product/service, the customer type (consumer vs business), the jurisdictions of the users, and how the terms are presented (checkbox, sign-up, footer link).
  - name: terms
    required: false
    description: The current ToS/EULA and linked policies, and any platform/app-store or payment-rail rules that apply.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, privacy/privacy-notice-drafter, privacy/cookie-and-tracking, contracts/saas-and-cloud-review, regulatory/accessibility-compliance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Online Terms & Consumer-Terms Audit

Takes a product's customer-facing terms and returns whether they are validly formed, enforceable, and consumer-law compliant — and where a one-sided or non-compliant clause will be struck down or draw a regulator. The deliverable is an enforceability + compliance audit (or drafted terms) with the unfair-terms and assent risks flagged, not a generic "add a ToS".

## When to use / not use

- Use: auditing or drafting consumer-facing ToS/EULA and sign-up flows; checking the terms are validly formed and binding; screening for unfair/one-sided clauses and mandatory consumer rights; confirming required linked policies and platform/app-store rules.
- Hand off: a negotiated, bilateral commercial contract → `contracts/contract-review`; the privacy notice content itself → `privacy/privacy-notice-drafter`; the cookie banner/tracking consent → `privacy/cookie-and-tracking`; a B2B SaaS/cloud agreement's substance → `contracts/saas-and-cloud-review`; the product's accessibility obligations → `regulatory/accessibility-compliance`.

## Inputs to collect first

1. The **product/service** and whether users are **consumers or businesses** (consumer-protection law changes everything).
2. The **jurisdictions** of the users (EU/UK consumer law, India, US state law differ).
3. **How the terms are presented** — checkbox/clickwrap, sign-up gate, or a footer "browsewrap" link.
4. The current **terms + linked policies** and any **platform/app-store/payment** rules.

## Method

1. **Test formation/assent first — unenforceable terms don't matter how good they are.** **Clickwrap** (affirmative "I agree" to presented terms) is generally binding; **browsewrap** (terms behind a footer link, no action) is often **not** — and unusual/onerous terms need particular prominence. Check the terms are actually presented and assented to, with a record of version and acceptance `[verify current]`.
2. **Apply consumer-protection mandatory rules.** For consumers, many protections are **non-waivable**: a clause can't exclude liability for death/personal injury or defeat statutory warranties/cancellation/refund rights; **unfair terms** (significant imbalance contrary to good faith) are void. Don't rely on exclusions that won't bind consumers.
3. **Screen the one-sided clauses.** Over-broad liability exclusions/caps, unilateral variation rights, auto-renewal without clear disclosure, unreasonable penalties/fees, forced-arbitration/class-waivers (jurisdiction-dependent), and one-sided IP/content grabs — flag each for enforceability and fairness.
4. **Check mandatory disclosures.** Auto-renewal and cancellation terms disclosed clearly (several jurisdictions mandate this), pricing/taxes, cooling-off/withdrawal for distance sales, and the trader's identity/contact.
5. **Confirm the linked-policy stack.** Privacy notice → `privacy/privacy-notice-drafter`, cookie/tracking consent → `privacy/cookie-and-tracking`, acceptable-use, and any community/content rules — present, current, and consistent with the ToS.
6. **Respect platform and payment rules.** App-store (Apple/Google) and payment-rail rules impose terms (refunds, billing, account deletion) that override or supplement your ToS for those channels `[verify current]`.
7. **Jurisdiction and governing-law reality.** A governing-law/forum clause can't strip consumers of their home-country mandatory protections or local forum rights in many regimes — don't over-claim.
8. **Draft/fix for plain language and prominence.** Consumer terms must be intelligible; bury-the-onerous-term drafting is both unfair and poor assent → `regulatory/accessibility-compliance` for readability.
9. **Score against the Checks table** and set a verdict: **ENFORCEABLE & COMPLIANT / FIXES NEEDED / NOT ENFORCEABLE (redraft)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Assent weak (browsewrap / no record) | Clickwrap + version + acceptance record | S1 | Move to affirmative assent `[verify current]` |
| Clause excludes non-waivable consumer rights | No exclusion of liability/warranty the law protects | S1 | Remove/limit the exclusion |
| Unfair / one-sided term (imbalance) | Balanced, good-faith terms | S1 | Re-draft the unfair term |
| Auto-renewal / cancellation not clearly disclosed | Clear disclosure + easy cancellation | S2 | Add the disclosure |
| Mandatory consumer disclosures missing | Cooling-off / pricing / identity present | S2 | Add the disclosures |
| Linked policies missing/inconsistent | Privacy/cookie/AUP present + consistent | S2 | Complete and reconcile the stack |
| Platform/app-store rules not honoured | Channel-specific terms applied | S2 | Conform to the platform rules `[verify current]` |
| Governing-law clause over-claims vs consumers | Mandatory local protections preserved | S2 | Narrow the clause |
| Onerous terms buried / unintelligible | Plain, prominent presentation | S3 | Rewrite for clarity/prominence |

## Output

Lead with `Verdict: ENFORCEABLE & COMPLIANT | FIXES NEEDED | NOT ENFORCEABLE — <product> — <top risk>`. Then the output contract. Add:

- **Assent**: how terms are formed and whether that binds.
- **Consumer compliance**: non-waivable-rights and unfair-terms findings.
- **One-sided clauses**: the flagged terms with the fix.
- **Disclosures & linked policies**: auto-renewal/cancellation + policy stack status.
- **Platform/jurisdiction**: channel and governing-law findings.
- One JSON finding per issue with `category: "tos-audit"`.

## Edge cases & pitfalls

- **Browsewrap illusion**: terms behind a footer link that the user never actively accepts are often unenforceable — especially the onerous bits; use clickwrap with a record.
- **Exclusions that don't bind consumers**: a liability waiver or warranty disclaimer that consumer law voids gives false comfort — and parading it can itself breach unfair-terms rules.
- **Auto-renewal traps**: hidden auto-renewal and hard-to-cancel flows are a growing regulatory target — disclose clearly and make cancellation easy.
- **Governing-law over-reach**: you can't contract a consumer out of their home mandatory protections or local forum in many regimes — don't claim you have.
- **Platform override**: app-store and payment rules can supersede your ToS on refunds/billing for those channels — reconcile, don't ignore.

## References

- Volatile facts: cite `[verify current]` where a consumer-law unfair-terms rule, auto-renewal disclosure law, or platform/app-store rule is load-bearing; `EU-DATA-01` for unfair B2B data terms where relevant.
- The applicable consumer-protection and unfair-contract-terms law (EU UCTD/CRD, UK CRA, India Consumer Protection Act, US state law); platform/app-store and payment-network rules; the linked privacy/cookie policies.
