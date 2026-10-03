---
name: corporate-fdi-fema-assessment
description: >-
  Assesses inbound foreign investment into an Indian entity under FEMA and the FDI policy: automatic vs government
  route, sectoral caps and conditions, the Press Note 3 land-border rule, pricing guidelines, and the FC-GPR / FLA /
  downstream reporting that follows. Use to check whether a foreign investment is permitted and what filings it
  triggers. Not for M&A diligence at large → corporate/ma-due-diligence; not for listed-company disclosure →
  corporate/listed-company-disclosure.
module: corporate
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of route-check (permitted route + caps), filing-check (what reports are due and when) or structure-review (assess a proposed investment structure).
  - name: investment
    required: false
    description: The investor (country of residence/beneficial ownership), the Indian investee entity, the instrument (equity/CCPS/CCD), the amount and the stake, and the sector/business activity.
  - name: context
    required: false
    description: Whether any investor is from or beneficially owned in a land-bordering country, whether this is a fresh infusion / secondary transfer / downstream investment, and the pricing basis.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/ma-due-diligence, corporate/listed-company-disclosure, corporate/entity-compliance-calendar, research/india-legal-research, regulatory/competition-merger-control]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# FDI & FEMA Assessment

Takes a proposed foreign investment into an Indian entity and returns whether it is permitted, by which route, under what sectoral cap and conditions, and the FEMA reporting it triggers. The deliverable is a route + conditions + filings determination with the traps flagged, not a general "FDI is allowed in India".

## When to use / not use

- Use: checking whether an inbound investment is under the automatic or government route; confirming the sectoral cap and any entry conditions; screening for the Press Note 3 land-border approval requirement; listing the FEMA filings and their deadlines; reviewing a proposed instrument/pricing for FEMA compliance.
- Hand off: the wider acquisition diligence (title, contracts, litigation) → `corporate/ma-due-diligence`; a SEBI-listed target's disclosure obligations → `corporate/listed-company-disclosure`; the recurring ROC/FEMA compliance calendar → `corporate/entity-compliance-calendar`; finding the current policy/master-direction text → `research/india-legal-research`; a merger-control threshold check → `regulatory/competition-merger-control`.

## Inputs to collect first

1. The investor's country of residence **and** beneficial ownership (the land-border test looks through to beneficial ownership).
2. The Indian investee entity and its exact business activity / sector (caps and conditions are sector-specific).
3. The instrument — equity, compulsorily convertible preference shares/debentures (FDI-eligible) vs optionally/non-convertible (treated as debt/ECB).
4. The amount, resulting stake, and whether it is a fresh issue, a secondary transfer from a resident, or a downstream investment by an Indian entity.
5. The pricing basis (valuation) and the entry date.

## Method

1. **Confirm the instrument is FDI-eligible.** Equity and compulsorily/mandatorily convertible instruments are FDI; optionally-convertible or redeemable instruments are generally debt (ECB rules), not FDI — misclassifying the instrument misroutes the whole analysis.
2. **Apply the Press Note 3 land-border rule first.** An investment where the investor is **of, or beneficially owned in,** a country sharing a land border with India requires **prior government approval regardless of sector or amount** `[verify current]`. Look through to beneficial ownership; this is the most common reason an otherwise-automatic deal needs approval.
3. **Find the sector and its cap/route.** Determine the applicable sectoral cap (up to 100% automatic in many sectors) and whether any portion needs government approval, plus entry conditions (minimum capitalisation, lock-in, local sourcing, licensing). Some sectors are prohibited (e.g. lottery, chit funds, certain real-estate business) `[verify current]`.
4. **Check prohibited / conditional activities.** Confirm the business activity is not a prohibited sector and that any conditions (e.g. brownfield pharma, defence, digital media, insurance caps) are satisfiable.
5. **Pricing guidelines.** A fresh issue to or transfer from a non-resident must respect FEMA pricing — issue/transfer price not less/more favourable to the non-resident than a fair value by an accepted valuation methodology; keep the valuation certificate.
6. **Map the reporting.** A fresh issue files **FC-GPR** (via the RBI FIRMS portal, typically within 30 days of allotment); a resident↔non-resident transfer files **FC-TRS**; downstream investment files **DI**; and the entity files the annual **FLA** return. Late filing attracts Late Submission Fee / compounding `[verify current]`.
7. **Downstream investment.** If the investee is itself foreign-owned-and-controlled, its onward investment into another Indian company is **indirect FDI** and must itself comply with route/caps and DI reporting.
8. **Score against the Checks table** and set a decision: **PERMITTED (automatic) / PERMITTED WITH APPROVAL (government route) / NOT PERMITTED / CONDITIONS TO SATISFY**, and list the filings due.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Land-border (PN3) approval missed | Beneficial ownership traced; approval obtained where a border country is involved | S1 | Route via government approval before investing `[verify current]` |
| Instrument not FDI-eligible | Equity / CCPS / CCD (compulsorily convertible) used | S1 | Re-paper as compulsorily convertible, or treat as ECB |
| Sector cap / route misidentified | Correct cap + automatic/approval split confirmed | S1 | Re-route; get approval for the capped-above portion |
| Prohibited sector | Activity confirmed outside the prohibited list | S1 | Stop; the investment is not permissible |
| Entry conditions unmet (min cap, lock-in, sourcing) | Conditions identified and satisfiable | S2 | Build conditions into the deal terms |
| Pricing below/above FEMA floor/ceiling | Valuation by accepted method; certificate held | S2 | Reprice to the FEMA-compliant value |
| FC-GPR / FC-TRS / DI not filed in time | Filing mapped with its deadline on the FIRMS portal | S2 | File now; budget LSF/compounding `[verify current]` |
| Annual FLA return skipped | FLA filed for every year with foreign holding | S3 | File the FLA return |
| Indirect/downstream FDI not analysed | Downstream route/caps + DI reporting checked | S2 | Run the downstream analysis |

## Output

Lead with `Decision: PERMITTED (AUTOMATIC) | PERMITTED WITH GOVERNMENT APPROVAL | CONDITIONS TO SATISFY | NOT PERMITTED — <investor→investee> — <key reason>`. Then the output contract. Add:

- **Route determination**: sector · cap · automatic/approval · PN3 land-border result.
- **Conditions**: entry conditions / sectoral conditions to satisfy.
- **Pricing**: basis and whether it meets the FEMA floor/ceiling.
- **Filings due**: FC-GPR / FC-TRS / DI / FLA with deadlines.
- One JSON finding per issue with `category: "fdi-fema"`.

## Edge cases & pitfalls

- **Beneficial-ownership blindness**: an investor incorporated in a neutral country but beneficially owned in a land-border country still triggers PN3 — trace ownership, don't stop at incorporation.
- **Optionality kills FDI treatment**: an optionally-convertible or assured-return instrument is debt under FEMA, not FDI — the "equity" deal becomes an ECB with its own rules.
- **Downstream = indirect FDI**: a foreign-owned Indian holdco investing onward carries the FDI conditions with it; treating it as a domestic investment is a common error.
- **Reporting lapses compound**: FC-GPR/FC-TRS delays accrue Late Submission Fee and can require RBI compounding — diarise the 30-day windows.
- **Sector conditions beyond the cap**: even at 100% automatic, conditions (minimum capitalisation, lock-in, local sourcing) can bite — the cap is not the whole test.

## References

- Volatile facts: `IN-CCI-01` where a competition-threshold check runs alongside. FDI sectoral caps, the Press Note 3 land-border rule, prohibited sectors, pricing guidelines and reporting deadlines are all volatile — cite `[verify current]` wherever a cap, route, or deadline is load-bearing.
- The consolidated FDI Policy, FEMA (Non-debt Instruments) Rules, RBI Master Directions on FDI/reporting, and the FIRMS portal (FC-GPR / FC-TRS / FLA).
