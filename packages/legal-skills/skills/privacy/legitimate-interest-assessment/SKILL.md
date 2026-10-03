---
name: privacy-legitimate-interest-assessment
description: >-
  Runs and documents a legitimate-interests assessment (LIA) under GDPR / UK GDPR Art. 6(1)(f): the three-part
  purpose, necessity and balancing test, with safeguards, the objection right, and a recorded outcome. Use when
  relying on legitimate interests as the lawful basis (direct marketing to existing customers, fraud prevention,
  network security, intra-group transfers, analytics). Not for choosing a lawful basis from scratch →
  privacy/gdpr-compliance; not for an AI/high-risk DPIA → privacy/privacy-impact-assessment.
module: privacy
version: 1.0.0
jurisdictions: [EU, UK]
risk_tier: review-required
inputs:
  - name: processing
    required: true
    description: The processing activity — purpose, data categories, data subjects, source, who it is shared with, and retention.
  - name: our_interest
    required: false
    description: The business (or third-party) interest relied on, and whether a less intrusive alternative exists.
  - name: context
    required: false
    description: Reasonable expectations of the data subjects, any children/vulnerable groups, special-category data, and existing safeguards.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/privacy-impact-assessment, privacy/privacy-notice-drafter, privacy/cookie-and-tracking, privacy/data-subject-requests]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Legitimate Interest Assessment (LIA)

Documents whether legitimate interests (GDPR Art. 6(1)(f)) is an appropriate lawful basis for a processing activity, by working the three-part test and recording the outcome so it is defensible to a regulator and to data subjects. The deliverable is a completed LIA with a clear go / no-go and the safeguards the "go" depends on.

## When to use / not use

- Use: relying (or proposing to rely) on legitimate interests — customer-base direct marketing, fraud prevention, information/network security, debt recovery, intra-group administrative transfers, product analytics, enrichment, and most B2B processing.
- Hand off: picking a lawful basis in the first place → `privacy/gdpr-compliance`; a high-risk/large-scale or new-tech activity that needs a full DPIA → `privacy/privacy-impact-assessment` (an LIA can feed it); cookies/SDKs, which usually need **consent** under ePrivacy, not LI → `privacy/cookie-and-tracking`; DPDPA/India, which has **no** legitimate-interests basis of this kind → `privacy/gdpr-compliance` / the India pack.

## Inputs to collect first

1. The precise purpose (specific, not "business purposes") and whether it is our interest or a third party's.
2. Data categories, volume, data subjects, and source (collected from them or obtained indirectly).
3. Whether any data is special-category (Art. 9) or criminal-offence data, or relates to children.
4. Data subjects' reasonable expectations given the relationship and how data was collected.
5. Existing and available safeguards (minimisation, pseudonymisation, opt-out, retention limits).

## Method

Work the three parts in order; a failure at any part means **do not** rely on LI.

1. **Purpose test — is there a legitimate interest?**
   - Name the interest specifically; it can be ours or a third party's (and includes commercial interests). Confirm it is real, present and lawful.
   - Note any sector/recital support (e.g. Recital 47 direct marketing *may* be a legitimate interest; Recital 49 network/information security).
2. **Necessity test — is the processing necessary for it?**
   - Is the processing a *targeted and proportionate* way to achieve the interest, with **no less intrusive alternative**? If the aim is achievable another way (less data, consent where practical, aggregation), LI necessity fails.
3. **Balancing test — do the individual's interests override?** Weigh:
   - **Nature of the data** — special-category or criminal-offence data heavily tilts against LI (and Art. 9 needs its own condition regardless); children's data needs extra weight.
   - **Reasonable expectations** — would the individual expect this use given how you got the data and your relationship? Unexpected, invisible or novel uses tilt against.
   - **Impact** — intrusiveness, volume, whether it enables tracking/profiling or significant decisions, and the risk of harm.
   - **Safeguards** — minimisation, pseudonymisation, transparency, easy opt-out/objection, short retention — these can tip a borderline case to "pass".
4. **Right to object** — Art. 21: data subjects can object to LI-based processing at any time; for **direct marketing** the objection is **absolute** (Art. 21(2)-(3)) and must be honoured with no balancing. Confirm an easy opt-out exists and the privacy notice discloses the LI basis and the objection right.
5. **Record the outcome** — pass / fail per part, the safeguards relied on, the residual risk, and the date/owner. Keep it with the ROPA so it can be produced on request.
6. **Score** and set a decision: **RELY ON LI (with safeguards) / DO NOT RELY — use <basis> / RELY ONLY IF <condition>**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Interest vague / not identified | Specific, real, lawful interest named | S2 | Re-state the purpose precisely |
| Necessity not shown / less intrusive route exists | Processing is targeted; no lighter alternative | S2 | Use the lighter route or another basis |
| Special-category or criminal-offence data on LI alone | Art. 9/10 condition secured; LI alone insufficient | S1 | Stop; secure Art. 9 condition or consent |
| Children's data not given extra weight | Heightened balancing; often consent | S2 | Re-balance; consider consent |
| Processing outside reasonable expectations | Expectation supported by relationship/notice | S2 | Add transparency or drop the use |
| No easy opt-out / objection route | Simple, free objection; absolute for marketing | S1 for direct marketing | Build opt-out before go-live |
| LI basis not disclosed in the notice | Notice names LI + the interest + objection right | S2 | `privacy/privacy-notice-drafter` |
| No recorded LIA | Dated LIA stored with the ROPA | S3 | Document and file |
| Relying on LI for cookies/tracking | ePrivacy consent, not LI | S2 | `privacy/cookie-and-tracking` |

## Output

Lead with `Decision: RELY ON LI | DO NOT RELY (use <basis>) | RELY ONLY IF <condition> — <one-line reason>`. Then the output contract. Add:

- **LIA record**: purpose test · necessity test · balancing (data nature · expectations · impact · safeguards) — each with a one-line conclusion.
- **Safeguards relied on** and the **objection route**.
- One JSON finding per failed/at-risk part with `category: "lawful-basis"`.

## Edge cases & pitfalls

- **Consent dressed as LI**: if you could and should have asked for consent (e.g. non-essential tracking), LI is not a workaround — and ePrivacy may mandate consent regardless.
- **Marketing objection is absolute**: no balancing once an individual objects to direct marketing — suppress, don't debate.
- **DPDPA has no LI basis**: do not port this analysis to India; DPDPA relies on consent or specified "legitimate uses" (s.7) with different contours `[verify current]`.
- **Special-category trap**: Art. 6 LI never substitutes for an Art. 9 condition — you need both.
- **One LIA per purpose**: a new purpose is a new LIA, not a tweak to the old one.

## References

- Volatile facts: cite DPDPA/India points via the India pack where relevant; mark `[verify current]`.
- GDPR / UK GDPR Arts. 6(1)(f), 9, 10, 13-14, 21; Recitals 47-49; ICO legitimate-interests guidance and LIA template; EDPB guidance on Art. 6(1)(f) `[verify current]`.
