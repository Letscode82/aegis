---
name: regulatory-esg-reporting
description: >-
  Assesses readiness for mandatory sustainability disclosure across the converging regimes — India BRSR / BRSR Core,
  EU CSRD/ESRS, and the ISSB (IFRS S1/S2) baseline — determining which applies and when, mapping the required
  disclosures, and surfacing the data and double-materiality gaps. Use to scope ESG reporting obligations or prepare a
  first disclosure. Not for sustainability clauses in a contract → contracts/sustainability-clauses; not for listed-
  company periodic disclosure → corporate/listed-company-disclosure.
module: regulatory
version: 1.0.0
jurisdictions: [global, IN, EU]
risk_tier: review-required
inputs:
  - name: organisation
    required: true
    description: The entity — size (turnover/employees/balance sheet), listing status and market, sectors, and where it operates or has value-chain exposure.
  - name: regimes
    required: false
    description: Which frameworks are in question (BRSR/BRSR Core, CSRD/ESRS, ISSB/IFRS S1-S2) or "work out which apply".
  - name: posture
    required: false
    description: What's already reported (voluntary ESG report, GRI/TCFD, prior BRSR) and the data/assurance capability in place.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/applicability-mapper, corporate/listed-company-disclosure, contracts/sustainability-clauses, regulatory/regulatory-change-monitor, corporate/entity-compliance-calendar]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# ESG & Sustainability Reporting

Takes an organisation and returns which mandatory sustainability-disclosure regime bites (India BRSR/BRSR Core, EU CSRD/ESRS, ISSB baseline), the required disclosure content, and the data/materiality/assurance gaps to close before the first filing. The deliverable is an applicability + readiness assessment with a gap list, not a restatement of a framework.

## When to use / not use

- Use: working out whether BRSR, CSRD or ISSB applies and from when; scoping the disclosures a first mandatory sustainability report must carry; gap-assessing current ESG reporting against a mandatory framework; preparing for assurance.
- Hand off: drafting sustainability/human-rights terms into a contract → `contracts/sustainability-clauses`; general listed-company periodic/event disclosure → `corporate/listed-company-disclosure`; the broad "which regulations apply to us" triage → `regulatory/applicability-mapper`; keeping on top of framework changes over time → `regulatory/regulatory-change-monitor`; the filing-deadline calendar → `corporate/entity-compliance-calendar`.

## Inputs to collect first

1. The **organisation's size** (turnover / employees / balance-sheet total), **listing status and market**, and **sectors** — these drive phased applicability under every regime.
2. **Where it operates and sources** — EU nexus (incl. non-EU parents with EU turnover under CSRD's third-country rule) and value-chain geography.
3. Which **regimes** are in question, or ask the skill to work them out.
4. The **current posture**: any voluntary report, GRI/TCFD alignment, prior BRSR filing, and the state of ESG **data systems and assurance**.

## Method

1. **Determine applicability and timing per regime first** — this is the whole value. BRSR/BRSR Core: SEBI's top-listed-entity phase-in and value-chain reporting. CSRD/ESRS: the size/listing thresholds and the phased first-report years, plus the third-country-undertaking rule and any **omnibus** change to scope/timing. ISSB: adoption is per-jurisdiction, so check whether the local regulator has mandated IFRS S1/S2 `[verify current]`.
2. **Anchor on the right materiality model.** CSRD/ESRS requires **double materiality** (impact *and* financial); ISSB is **financial materiality** (enterprise value); BRSR sits closer to impact/stakeholder reporting. Using the wrong lens produces the wrong disclosures — fix it before drafting.
3. **Map the disclosure architecture.** All three share the governance / strategy / risk-management / metrics-and-targets spine (TCFD-derived); map the organisation's content onto each applicable regime's structure (ESRS topical standards; IFRS S2 climate; BRSR's nine principles + Core attributes).
4. **Scope the value chain.** CSRD and BRSR Core both reach up/down the value chain (Scope 3, supplier data, BRSR Core value-chain disclosure) — identify where the data has to come from third parties and flag the collection gap early → `contracts/sustainability-clauses` for the flow-down.
5. **Pin down climate/GHG metrics.** Scope 1/2 and material Scope 3 emissions, transition plan, targets and scenario analysis are the hard-data core — confirm what's measured vs estimated and the methodology.
6. **Plan for assurance.** Limited (moving toward reasonable) assurance applies under CSRD and to BRSR Core attributes — reportable claims need an auditable evidence trail, not just a narrative.
7. **Avoid greenwashing in the disclosure itself.** Statements must be substantiated and balanced; unsupported "net-zero"/"green" claims in a regulated report carry securities and consumer-law exposure.
8. **Build the gap list and roadmap** — data gaps, materiality-assessment gap, assurance-readiness gap, and the filing deadline — sequenced to the first mandatory report.
9. **Score against the Checks table** and output applicability + per-regime disclosure map + prioritised gaps.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Applicability / first-year not established | Phase-in + thresholds resolved per regime | S1 | Determine applicability first `[verify current]` |
| Wrong materiality lens | Double (CSRD) vs financial (ISSB) vs BRSR applied | S1 | Re-run with the correct lens |
| Disclosure content not mapped to the regime | Governance/strategy/risk/metrics mapped per standard | S2 | Map content to each framework |
| Value chain / Scope 3 ignored | Value-chain + Scope 3 data sources identified | S2 | Scope the value chain |
| GHG metrics unmethodical | Scope 1/2/3 basis + methodology stated | S2 | Fix the emissions basis |
| Assurance-readiness not considered | Evidence trail for assured items exists | S2 | Build the assurance evidence |
| Greenwashing in the report | Claims substantiated + balanced | S1 | Substantiate or remove the claim |
| Deadline/calendar not set | First-report year + filing date recorded | S3 | Add to the compliance calendar |

## Output

Lead with `ESG reporting: <regimes that apply> — first report <year> — top gap: <the one that blocks filing>`. Then the output contract. Add:

- **Applicability**: which regime(s), thresholds met, first mandatory year.
- **Materiality**: the lens each regime requires and the assessment gap.
- **Disclosure map**: required content per applicable framework, with what's covered vs missing.
- **Data & assurance gaps**: value-chain/Scope 3, methodology, assurance-readiness.
- One JSON finding per gap with `category: "esg-reporting"`.

## Edge cases & pitfalls

- **Assuming a voluntary GRI/TCFD report already complies**: mandatory ESRS/BRSR Core/ISSB have specific structures and assurance — a glossy voluntary report rarely maps cleanly.
- **Single-materiality shortcut under CSRD**: skipping the impact side of double materiality under-scopes the whole report.
- **Forgetting the EU third-country reach**: a non-EU group can fall into CSRD via EU-generated turnover + an EU branch/subsidiary.
- **Scope 3 as an afterthought**: value-chain data takes a reporting cycle to collect — flag it at the start, not at filing.
- **Greenwashing by enthusiasm**: aspirational net-zero language without a substantiated transition plan is a regulated-disclosure risk, not marketing.

## References

- Volatile facts: cite `[verify current]` on every applicability threshold, phase-in year and any CSRD-omnibus scope/timing change, and on whether the local regulator has mandated ISSB — all are moving.
- The governing instruments (SEBI LODR / BRSR & BRSR Core framework; EU CSRD Directive 2022/2464 + the ESRS; IFRS S1/S2 as adopted locally) and current regulator guidance.
