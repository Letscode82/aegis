---
name: privacy-privacy-notice-drafter
description: >-
  Drafts layered privacy notices and itemised consent notices from a data inventory: GDPR / UK GDPR Art. 13-14
  transparency content and DPDPA notice/consent requirements, in plain language, with a short top layer and a full
  detailed layer. Use to write or refresh a privacy policy, a just-in-time notice, or a DPDPA consent notice. Not
  for the lawful-basis analysis behind it → privacy/legitimate-interest-assessment or privacy/gdpr-compliance; not
  for cookie-banner consent specifically → privacy/cookie-and-tracking.
module: privacy
version: 1.0.0
jurisdictions: [global, EU, UK, IN]
risk_tier: review-required
inputs:
  - name: inventory
    required: true
    description: The processing inventory / ROPA — purposes, data categories, sources, lawful bases, recipients, transfers, retention.
  - name: audience
    required: false
    description: Who the notice is for (customers, employees, website visitors, children) and the channel (website, app, just-in-time).
  - name: regimes
    required: false
    description: Which laws apply (GDPR/UK GDPR, DPDPA, US state laws) — drives the required content set.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/legitimate-interest-assessment, privacy/cookie-and-tracking, privacy/data-subject-requests, privacy/us-state-privacy, drafting/plain-language-explainer]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Privacy & Consent Notice Drafter

Produces a privacy notice that actually satisfies the transparency duties — layered so a reader gets the gist in seconds and the detail on demand — built from the data inventory rather than a generic template. For India, it also produces the DPDPA itemised consent notice. The deliverable is a notice that is complete, accurate to the processing, and readable.

## When to use / not use

- Use: drafting or refreshing a website/app/employee privacy notice; a just-in-time notice at a collection point; a DPDPA consent notice; aligning an existing notice to current processing.
- Hand off: deciding or defending the lawful basis the notice states → `privacy/gdpr-compliance` / `privacy/legitimate-interest-assessment`; the cookie banner and tracker consent → `privacy/cookie-and-tracking`; how the notice describes rights handling → `privacy/data-subject-requests`; pure readability pass → `drafting/plain-language-explainer`.

## Inputs to collect first

1. The ROPA / inventory: every purpose with its data categories, lawful basis, recipients, transfers and retention. **The notice must mirror the inventory — do not invent purposes.**
2. Audience and channel (customers vs employees vs visitors vs children; web/app/just-in-time).
3. Whether data is collected from the individual (Art. 13) or obtained indirectly (Art. 14 — adds source + the within-one-month / at-first-contact timing).
4. International transfers and the mechanism relied on.
5. Controller identity and DPO/representative contact.

## Method

1. **Confirm the regimes** and assemble the required content set for each (union of duties where several apply).
2. **GDPR / UK GDPR content** (Arts. 13-14): controller (and representative/DPO) identity and contact; purposes **and lawful basis for each** (and the legitimate interest where Art. 6(1)(f)); recipients/categories of recipients; international transfers and safeguards; retention period or criteria; data-subject rights (access, rectification, erasure, restriction, portability, **objection**, and withdrawing consent); right to complain to a supervisory authority; whether provision is statutory/contractual and the consequences of not providing; existence of automated decision-making/profiling with meaningful logic and consequences. For Art. 14 (indirect), add the **source** and the **categories** obtained, and meet the timing rule.
3. **DPDPA content** (India): an **itemised** notice — the personal data and the specific purposes — in plain language, with the right to withdraw consent as easily as given, the Consent Manager option, the grievance route, and the Data Protection Board complaint right; offer the notice in English and the Eighth Schedule languages where required `[verify current]` (IN-DPDP-01, IN-DPDP-03).
4. **US state content** (if in scope): categories collected/sold/shared, purposes, retention, consumer rights and the opt-out of sale/sharing and targeted advertising; link the mechanisms `[verify current]`.
5. **Layer it**: a short top layer (who we are, what we do with data, your choices, how to contact us) linking to the full notice; add just-in-time notices at sensitive collection points.
6. **Write in plain language**: short sentences, no legalese, define the few unavoidable terms; for a child-facing audience, age-appropriate wording.
7. **Cross-check against the inventory**: every purpose in the inventory appears; no purpose in the notice is unsupported by the inventory; bases match the LIAs/consent records.
8. **Score** and set a decision: **PUBLISH / PUBLISH WITH FIXES / REWRITE**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Purpose/basis mismatch with inventory | Every purpose has a stated, correct basis matching the ROPA | S2 | Reconcile with inventory/LIA |
| Missing Art. 13/14 element | All mandated elements present (see Method 2) | S2 | Add the missing element(s) |
| Art. 14 source/timing omitted | Source + categories + timing met for indirect data | S2 | Add source; fix timing |
| Rights incomplete | All applicable rights + how to exercise + complaint right | S2 | Add the rights block |
| Transfers not disclosed | Transfers + mechanism named | S2 | Add transfers section |
| Retention vague | Period or clear criteria per purpose | S3 | State retention/criteria |
| DPDPA notice not itemised | Item-by-item data × purpose, withdrawal + grievance | S2 (India) | Rebuild as itemised notice |
| Not layered / unreadable | Short top layer + full layer; plain language | S3 | Re-layer and simplify |
| Automated decisions not disclosed | ADM/profiling logic + consequences stated | S2 if ADM present | Add ADM disclosure |
| Children's audience not age-appropriate | Age-appropriate wording + extra protections | S2 | Rewrite for the audience |

## Output

Lead with `Decision: PUBLISH | PUBLISH WITH FIXES | REWRITE — <key gap or "complete">`. Then the output contract. Add:

- **The notice** as titled sections: top layer, then the full notice (who we are · what we collect · purposes & bases · sharing · transfers · retention · your rights · cookies link · contact & complaints). For India, also the **itemised consent notice** table (data item · purpose · withdrawal).
- **Coverage matrix**: required element · present? · where.
- One JSON finding per gap with `category: "transparency"`.

## Edge cases & pitfalls

- **Template drift**: a notice that promises purposes you no longer run (or omits ones you do) is a transparency breach — drive it from the live inventory.
- **Basis-by-copy-paste**: "legitimate interests" stated with no interest named, or "consent" where there is no consent mechanism, is a common and serious error — match the notice to the real basis/LIA.
- **Art. 14 timing**: for indirectly obtained data, the within-one-month / first-communication / before-disclosure rule is easy to miss.
- **DPDPA ≠ GDPR**: do not relabel a GDPR notice as DPDPA-compliant — the itemised consent notice, withdrawal parity and language requirements are distinct `[verify current]`.
- **Dark-pattern consent**: pre-ticked boxes and nudged "accept" undermine the whole notice; keep choices genuine.

## References

- Volatile facts: IN-DPDP-01, IN-DPDP-03 (DPDP Rules timing); mark `[verify current]` on any date/threshold.
- GDPR / UK GDPR Arts. 12-14, 21, 22; DPDP Act 2023 ss.5-6 and DPDP Rules 2025; US state privacy notice duties (CCPA/CPRA and successors) `[verify current]`.
