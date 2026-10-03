---
name: regulatory-financial-services-india
description: >-
  Maps an activity, product or entity to Indian financial-services regulation and its obligations: RBI (banking,
  NBFC, payment systems, digital lending, outsourcing/IT governance, data localisation), SEBI (securities,
  intermediaries, LODR, cyber CSCRF), IRDAI (insurance) and the regulatory-sandbox routes. Use to assess licensing,
  a compliance gap, or whether a fintech/product needs authorisation in India. Not for sector-neutral security
  mapping → regulatory/security-frameworks; not for privacy/DPDP → privacy/dpdpa-compliance.
module: regulatory
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: activity
    required: true
    description: The activity, product or entity — lending, payments, deposit-taking, broking, insurance distribution, investment advice, a fintech feature — and who the customers are.
  - name: entity
    required: false
    description: The entity type and any existing registration (bank, NBFC, payment aggregator, SEBI intermediary, insurer/intermediary), and whether foreign-owned (FDI overlay).
  - name: mode
    required: false
    description: One of licensing (does this need authorisation and which), gap-assess (obligations vs current state) or product-review (a specific product/feature). Defaults to gap-assess.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/security-frameworks, regulatory/operational-resilience, privacy/cross-border-transfer, corporate/fdi-fema-assessment, regulatory/sanctions-screening, privacy/dpdpa-compliance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Indian Financial Services Regulation

Takes a financial activity or product and answers which Indian regulator governs it, whether it needs authorisation, and what the binding obligations are — RBI, SEBI or IRDAI — with the data-localisation and IT-governance overlays that catch fintechs by surprise. The deliverable is a licensing/obligation decision with gaps, not a regulator overview.

## When to use / not use

- Use: assessing whether a product/activity needs RBI/SEBI/IRDAI authorisation; gap-assessing a regulated entity's obligations; reviewing a fintech feature (lending, payments, advisory) for Indian regulatory fit.
- Hand off: sector-neutral ISO/SOC2/NIST mapping → `regulatory/security-frameworks`; operational-resilience depth → `regulatory/operational-resilience`; cross-border personal-data transfer → `privacy/cross-border-transfer`; the DPDP privacy programme → `privacy/dpdpa-compliance`; foreign-investment entry route → `corporate/fdi-fema-assessment`; sanctions/AML screening → `regulatory/sanctions-screening`.

## Inputs to collect first

1. The activity and customer base (retail vs institutional changes the regime).
2. The entity type and any existing licence/registration.
3. Whether the model relies on a partner bank/NBFC (lending) or a licensed intermediary (payments/broking) — "regulated-by-partnership" is heavily scrutinised.
4. Foreign ownership (FDI/FEMA overlay) and any cross-border data flow.

## Method

1. **Identify the regulator by activity.** **RBI** — banking, deposit-taking, NBFC lending, payment systems/aggregators, digital lending, forex. **SEBI** — securities issuance/trading, intermediaries (brokers, RIAs, portfolio managers), listed-company obligations (LODR). **IRDAI** — insurance and distribution. Some products touch two (e.g. an insurance-linked investment).
2. **Licensing first.** Determine if the activity needs authorisation and which, and whether an exemption or a partnership model applies. For **digital lending**, apply the RBI Digital Lending Directions: lending must sit with a regulated entity (bank/NBFC), loan servicing and disbursal/repayment flow rules, LSP/DLA disclosure, no routing through the LSP's account, and borrower-data limits. A "we're just the app" framing does not escape the rules.
3. **Payments.** Payment Aggregator / Payment Gateway authorisation, settlement-account rules, KYC, and the prohibition on storing full card data (tokenisation) — map these for any payments feature.
4. **Data localisation (RBI).** Payment-system data must be stored in India (RBI storage-of-payment-system-data directions); cross-border processing may be allowed but the data must be stored domestically — a GDPR-style "SCCs and we're fine" answer is wrong here `[verify current]` (cite `IN-SECT-01` where the sector window matters).
5. **IT governance & cyber.** RBI IT Governance/outsourcing directions, SEBI **CSCRF** cyber framework, and IRDAI guidelines impose IT-risk, incident-reporting and outsourcing controls; CERT-In's 6-hour reporting overlays all of them (`IN-CERTIN-01`) `[verify current]` → `regulatory/operational-resilience`.
6. **Conduct & consumer protection.** Fair-practices code, grievance redress/ombudsman, pricing/APR transparency (digital lending), mis-selling rules (insurance/securities) — the conduct layer regulators enforce hardest against fintechs.
7. **AML/KYC and sanctions.** PMLA-driven KYC, beneficial-ownership, and sanctions screening sit across all three regulators → `regulatory/sanctions-screening`.
8. **FDI/FEMA overlay** where foreign-owned — sectoral caps and conditions (e.g. insurance cap, payments) and pricing/reporting → `corporate/fdi-fema-assessment`.
9. **Sandbox routes.** RBI/SEBI/IRDAI regulatory sandboxes can be the right path for a novel product rather than forcing it into an ill-fitting licence.
10. **Score against the Checks table** and set a decision: **AUTHORISED/COMPLIANT / CONDITIONS REQUIRED / NOT PERMITTED (as structured)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Regulated activity carried on without authorisation | Correct RBI/SEBI/IRDAI licence or valid partnership | S1 | Stop/restructure; pursue the licence or partner model |
| Digital lending routed to evade the regulated-entity rule | Lending sits with bank/NBFC; RBI DLG rules met | S1 | Re-architect to the DLG model |
| Payment-system data not stored in India | Domestic storage per RBI directions | S1 | Localise the data |
| Full card data stored (no tokenisation) | Tokenised; no PAN storage | S1 | Remove storage; tokenise |
| CERT-In / sector cyber reporting not wired | 6-hour CERT-In + sector incident reporting | S2 | Build the reporting runbook → `regulatory/operational-resilience` |
| No fair-practices / grievance / pricing transparency | Conduct + redress + APR disclosure in place | S2 | Add the conduct layer |
| AML/KYC/sanctions gaps | PMLA KYC + screening operational | S2 | Close KYC/screening gaps → `regulatory/sanctions-screening` |
| FDI cap/condition breached (foreign-owned) | Within sectoral cap + conditions + reporting | S2 | → `corporate/fdi-fema-assessment` |
| Novel product forced into an ill-fitting licence | Sandbox or correct route assessed | S3 | Consider the regulatory sandbox |

## Output

Lead with `Decision: AUTHORISED/COMPLIANT | CONDITIONS REQUIRED | NOT PERMITTED AS STRUCTURED — <activity> — <key reason>`. Then the output contract. Add:

- **Regulator & licence**: which regulator, what authorisation (or partnership/exemption), and why.
- **Obligation map**: licensing · localisation · IT/cyber · conduct · AML/KYC · FDI — status each.
- **Gap list** ranked with owner. One JSON finding per gap with `category: "fs-india"`.

## Edge cases & pitfalls

- **"We're just a tech platform"**: the regulated activity (lending, payments, advice) is what matters, not the app wrapper — RBI/SEBI look through the structure.
- **Localisation ≠ GDPR logic**: payment-system data must be *stored* in India regardless of a lawful cross-border transfer mechanism; the two regimes answer different questions.
- **Partner-bank/NBFC models**: the FLDG/partnership rules are specific and shifting — do not assume a prior structure still complies `[verify current]`.
- **Two regulators at once**: insurance-linked investments, or payments plus lending, can trigger IRDAI+SEBI or RBI+SEBI — map both.
- **Sector cyber windows differ**: SEBI CSCRF, IRDAI and RBI windows vary and sit *on top of* CERT-In's 6 hours — don't collapse them.

## References

- Volatile facts: `IN-CERTIN-01` (6-hour CERT-In), `IN-SECT-01` (sector cyber windows). Cite live where a threshold, cap or reporting window is load-bearing; mark `[verify current]`.
- RBI Act / Banking Regulation Act / PSS Act + RBI Digital Lending Directions, PA/PG and payment-data-storage directions, IT governance/outsourcing directions; SEBI Act + LODR + CSCRF + intermediary regulations; Insurance Act + IRDAI regulations; PMLA; FEMA.
