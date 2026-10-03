---
name: privacy-us-state-privacy
description: >-
  Assesses obligations under US state consumer-privacy laws (CCPA/CPRA, VCDPA, CPA, CTDPA and the growing set of
  comprehensive state statutes): applicability thresholds, consumer rights, notices, opt-outs for sale/share/targeted
  advertising, sensitive-data handling, universal opt-out signals, data-protection assessments, and processor terms.
  Use to scope which state laws apply and the gaps, or to review a specific right/opt-out. Not for GDPR/UK →
  privacy/gdpr-compliance; not for India DPDP → privacy/dpdpa-compliance.
module: privacy
version: 1.0.0
jurisdictions: [US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of applicability (which state laws bind), gap-assess (obligations vs current state) or rights-review (a specific consumer right / opt-out).
  - name: footprint
    required: false
    description: Where consumers are, revenue, number of consumers' data processed, and whether the business "sells" or "shares" data or does targeted advertising (drives thresholds).
  - name: data
    required: false
    description: Categories processed (incl. sensitive data / precise geolocation / minors) and the processing purposes.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/data-subject-requests, privacy/privacy-notice-drafter, privacy/dpa-review, privacy/cookie-and-tracking, regulatory/applicability-mapper]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# US State Privacy Laws

Takes a business's footprint and data use and answers which US state privacy laws apply and what they require — the consumer rights, the sale/share/targeted-advertising opt-outs, sensitive-data rules, universal opt-out signals and assessments — with the gaps ranked. The deliverable is an applicability + obligation map with gaps, not a 50-state treatise.

## When to use / not use

- Use: scoping which state consumer-privacy laws bind a business; gap-assessing obligations against current practice; reviewing a specific right or opt-out (sale/share, targeted advertising, sensitive data) for compliance.
- Hand off: EU/UK GDPR → `privacy/gdpr-compliance`; India DPDP → `privacy/dpdpa-compliance`; fulfilling a specific request → `privacy/data-subject-requests`; drafting the notice → `privacy/privacy-notice-drafter`; cookie/tracking consent and opt-out signals in depth → `privacy/cookie-and-tracking`; processor-contract terms → `privacy/dpa-review`.

## Inputs to collect first

1. Where the business's consumers are (which states), and revenue / number of consumers whose data is processed.
2. Whether the business "sells" or "shares" personal data or does targeted/cross-context behavioural advertising (these trigger the opt-out machinery).
3. Data categories — especially **sensitive data**, precise geolocation, and data about **minors**.
4. Current state: notices, opt-out mechanisms, rights process, assessments, processor contracts.

## Method

1. **Fix applicability per state.** The comprehensive statutes each have their own thresholds (revenue, number of consumers, or deriving revenue from selling data). CCPA/CPRA (California) has the broadest reach and a business-size/revenue trigger; most others key off a consumer-count threshold (often 100k, lower if selling). List the states that bind and why `[verify current]` — the roster keeps expanding.
2. **Map the consumer rights.** Access/know, delete, correct, and portability are near-universal; add **opt-out of sale/share**, **opt-out of targeted advertising**, and **opt-out of profiling** with legal/significant effects. Appeal rights exist in several states. State which rights apply in each binding state.
3. **"Sale" and "share" are broad.** Many states define "sale" to include disclosures for value beyond cash, and California's "share" captures cross-context behavioural advertising. Tag any ad-tech/data-broker flow as likely sale/share and require the opt-out → `privacy/cookie-and-tracking`.
4. **Honour universal opt-out signals.** Several states (incl. California GPC) require honouring browser-level opt-out signals — a "Do Not Sell/Share" link alone is not enough where GPC must be recognised.
5. **Sensitive data.** CPRA uses a "limit the use of sensitive personal information" right; most other states require **opt-in consent** to process sensitive data. Precise geolocation, health, biometrics, race/religion, and children's data are sensitive. Map the correct model per state.
6. **Minors.** Opt-in for teens' sale/share (often 13–16) and stricter rules for under-13 overlapping with COPPA — flag any processing of minors' data.
7. **Notices.** A compliant privacy notice with the state-required content and the opt-out links → `privacy/privacy-notice-drafter`.
8. **Data-protection / risk assessments.** Most newer statutes require assessments for high-risk processing (targeted advertising, sale, sensitive data, profiling) — a documented assessment obligation akin to a DPIA.
9. **Processor / "service provider"-"contractor" contracts.** Required contractual terms to keep a recipient a service provider (and out of "sale") — paper them → `privacy/dpa-review`.
10. **Score against the Checks table** and set a decision: **COMPLIANT / COMPLIANT WITH GAPS / NOT COMPLIANT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Sale/share or targeted-ad opt-out not offered where required | Working opt-out + "Do Not Sell/Share" where applicable | S1 | Stand up the opt-out; tag ad-tech flows |
| Universal opt-out signal (GPC) not honoured | GPC recognised in states that require it | S1 | Implement signal handling |
| Sensitive data processed without the right model | Opt-in (most states) / limit-use (CPRA) applied | S1 | Apply consent/limit-use per state |
| Minors' data without opt-in / COPPA overlap missed | Teen opt-in + under-13 COPPA handled | S1 | Add age-appropriate consent |
| Consumer rights not operable in time | Rights process + statutory response windows | S2 | Stand up intake → `privacy/data-subject-requests` |
| No/under-inclusive privacy notice | State-required content + opt-out links | S2 | → `privacy/privacy-notice-drafter` |
| High-risk processing without an assessment | Documented data-protection assessment | S2 | Run the assessment |
| Service-provider contracts missing required terms | Statutory processor terms in place | S2 | → `privacy/dpa-review` |
| Applicability not re-checked as new states take effect | Roster reviewed on a cadence | S3 | Set a re-assessment trigger |

## Output

Lead with `Status: COMPLIANT | COMPLIANT WITH GAPS | NOT COMPLIANT — <scope> — <key reason>`. Then the output contract. Add:

- **Applicability matrix**: state · threshold met? · key rights · opt-outs required.
- **Obligation gaps**: opt-outs · GPC · sensitive data · minors · notices · assessments · contracts — status each.
- **Gap list** ranked with owner. One JSON finding per gap with `category: "us-state-privacy"`.

## Edge cases & pitfalls

- **"We don't sell data"**: most statutes define sale/share broadly enough to capture ad-tech and data-sharing-for-value — check the behaviour, not the label.
- **GPC is mandatory where required**: a manual opt-out link doesn't satisfy a state that requires honouring the browser signal.
- **Sensitive-data model differs by state**: CPRA's limit-use right is not the opt-in most other states require — don't apply one model everywhere.
- **The roster keeps growing**: new state laws take effect regularly; an applicability answer is a snapshot — mark `[verify current]` and set a review trigger.
- **COPPA overlap**: children's data pulls in a federal regime on top of the state law — don't treat it as just another state right.

## References

- Volatile facts: cite `[verify current]` on thresholds and the current roster of in-effect state laws.
- CCPA/CPRA (California) + CPPA regs; VCDPA (Virginia), CPA (Colorado), CTDPA (Connecticut), and the other comprehensive state statutes; Global Privacy Control; COPPA for minors.
