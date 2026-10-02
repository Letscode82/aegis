---
name: regulatory-applicability-mapper
description: >-
  Maps every regulatory regime that applies to a product, activity, market entry or deal, explains how the
  regimes interact (overlap, conflict, precedence) and lists what each demands, with owners and triggers. Use
  when asked "what laws apply to X", before a launch, new country, new data use, AI feature, licence question or
  deal structure decision. Not for converting a single new law into actions → regulatory/regulatory-change-monitor;
  deep work on one regime → its own skill (e.g. privacy/dpdpa-compliance, regulatory/ai-governance).
module: regulatory
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: subject
    required: true
    description: The product, activity, transaction or change to be mapped, described in business terms.
  - name: footprint
    required: false
    description: Entities involved, where customers/users are, where data and servers sit, where staff are, where revenue is booked.
  - name: facts
    required: false
    description: Customer type (consumer/business/government), sector, data types, payments, AI use, export items, counterparties.
  - name: existing_licences
    required: false
    description: Licences, registrations and regulator relationships the group already holds.
  - name: depth
    required: false
    description: scan (regime list with triggers) or full (adds obligations, interactions and owners). Default full.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/regulatory-change-monitor, regulatory/ai-governance, privacy/dpdpa-compliance, privacy/gdpr-compliance, privacy/us-state-privacy, regulatory/financial-services-india, regulatory/sanctions-screening, regulatory/export-controls, regulatory/competition-merger-control, regulatory/product-cyber-obligations, regulatory/operational-resilience, regulatory/accessibility-compliance, corporate/fdi-fema-assessment, research/multi-jurisdiction-survey]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Regulatory Applicability Mapper

Answers "which rules apply to this, and what do they make us do?" for a defined subject. It works from facts to triggers (not from a list of laws to a guess), so every regime on the map carries the fact that brought it in, and every regime left off has a reason. The user gets a regime map, the obligations that matter before launch or signing, the interactions that cause trouble (two regulators, conflicting rules, localisation), and the hand-offs to specialist skills.

## When to use / not use

- Use: product launches; entering a new country or customer segment; new data or AI use; outsourcing/offshoring; deal structuring (asset vs share, licence transfer); a business question framed as "do we need a licence / permission for X?".
- Hand off: a new law/circular to implement → `regulatory/regulatory-change-monitor`; same question across 10+ countries → `research/multi-jurisdiction-survey`; deep-dive on a regime → the specialist skill named in the map.

## Inputs to collect first

The facts that most often flip applicability - ask for any that are missing:

1. **Who** - our entity(ies) and their incorporation; customer type (B2C, B2B, government, children).
2. **Where** - where customers are, where we market, where data is stored/accessed, where staff and servers are.
3. **What** - what is sold or done; does money move (payments, credit, stored value, crypto, insurance-like promises)?
4. **Data** - personal data? sensitive? children? large-scale? AI/ML involved?
5. **Goods and technology** - physical items, encryption, dual-use tech, software exports.
6. **Counterparties** - government, sanctioned-country exposure, intermediaries, competitors.
7. **Revenue/size** - turnover, user counts, assets (many regimes have thresholds).

State assumptions for anything still unknown and show which regime flips if the assumption is wrong.

## Method

1. **Restate the subject** as a fact pattern (one paragraph) and list the jurisdictions engaged by each connecting factor: establishment, targeting/offering, effects, data location, nationality of persons, currency/clearing (USD → US nexus for sanctions).
2. **Run the trigger sweep** - for each domain in the trigger table below, ask the trigger question. Yes / No / Unknown, with the fact relied on.
3. **For each "Yes"**, identify: regime and instrument; our role under it (e.g. provider/deployer, controller/processor, regulated entity/outsourcing provider); thresholds met; commencement status (cite volatile-fact IDs `[verify current]`); core obligations; regulator; sanction band.
4. **For each "Unknown"**, keep it on the map as **Conditional** with the fact that decides it.
5. **Interactions** - check and record:
   - **Precedence**: DPDPA s.38 (DPDPA prevails over conflicting law but is in addition to other laws) and s.16(2) (stricter sector transfer rules prevail); GDPR as lex generalis vs sector law; EU AI Act + GDPR operate cumulatively.
   - **Dual regulation**: same activity supervised by two regulators (e.g. RBI and SEBI; DPB and sector regulator for breaches; CERT-In and NIS2 for a group).
   - **Conflicts**: localisation vs global architecture; US discovery vs foreign blocking/data laws; sanctions vs contractual performance; anti-boycott.
   - **Licence gates**: anything that must be obtained *before* launch (licence, registration, approval) → mark blocking.
6. **Score** each regime finding: S1 = operating without a required licence/approval or a prohibited activity; S2 = mandatory obligation not yet built with near-term commencement or launch; S3 = obligation with time to build; S4/Info = monitoring only. Use likelihood where enforcement history is relevant.
7. **Assign owners and hand-offs** - each regime to a function owner and an AEGIS skill.

## Trigger sweep

| Domain | Trigger question | Key regimes (illustrative, not exhaustive) | Hand-off |
|---|---|---|---|
| Privacy | Personal data of people in IN / EU / UK / US states? | DPDPA 2023 + Rules 2025; GDPR / UK GDPR; CCPA/CPRA and state laws; sector privacy (HIPAA, GLBA) | `privacy/dpdpa-compliance`, `privacy/gdpr-compliance`, `privacy/us-state-privacy` |
| Cyber | Operating ICT systems in India? Essential/important entity in EU? Financial entity in EU? Product with digital elements sold in EU? | CERT-In Directions 2022; NIS2; DORA; Cyber Resilience Act | `regulatory/security-frameworks`, `regulatory/operational-resilience`, `regulatory/product-cyber-obligations` |
| AI | Placing on market / putting into service / using AI output in EU? AI in hiring, credit, insurance, education, biometrics? Synthetic media in India? | EU AI Act (EU-AIA-01/02/03); IT Rules 2021 as amended in 2026 (synthetic content); sector AI guidance; US state AI laws | `regulatory/ai-governance` |
| Financial services | Payments, lending, deposits, wallets, investment advice, insurance distribution, crypto? | RBI (PSS Act 2007, NBFC, digital lending directions), SEBI, IRDAI, PMLA; EU PSD2/MiCA; US money transmitter laws | `regulatory/financial-services-india` |
| Consumer | Selling to consumers? Online? | Consumer Protection Act 2019 + E-Commerce Rules 2020; dark-pattern guidelines; EU UCPD/CRD/DSA; FTC Act s.5 | `contracts/terms-of-service-audit` |
| Platforms / intermediaries | Hosting third-party content in India / EU? | IT Act s.79 + IT Rules 2021; DSA; Online Gaming law where applicable `[verify current]` | `ip/infringement-takedown` |
| Telecom | Providing telecom services, messaging, OTT comms? | Telecommunications Act 2023 (India); EECC | - |
| Trade | Exporting goods, software, technology or technical data? Sanctioned countries/persons? | SCOMET (FTDR Act); EAR/ITAR; EU Dual-Use Reg. 2021/821; OFAC, EU, UK, UN sanctions | `regulatory/export-controls`, `regulatory/sanctions-screening` |
| Foreign investment | Non-resident investment, ECB, ODI, land-border country investor? | FEMA NDI Rules 2019, Press Note 3 (2020); ODI Rules 2022; EU FDI screening; CFIUS | `corporate/fdi-fema-assessment` |
| Competition | Deal over thresholds? Coordination with competitors? | Competition Act 2002 (incl. deal-value test IN-CCI-01); EU Merger Reg.; HSR | `regulatory/competition-merger-control` |
| Anti-corruption | Government touchpoints, intermediaries, licences? | Prevention of Corruption Act 1988 (s.9 corporate offence); FCPA; UK Bribery Act 2010 | `regulatory/anti-bribery` |
| Employment | Hiring/monitoring staff in a new place? | Labour Codes (IN-LAB-01); state Shops & Establishments; EU/UK employment law | `employment/india-labour-codes` |
| Accessibility | Digital product to public/consumers? | RPwD Act 2016; European Accessibility Act; ADA/Section 508 | `regulatory/accessibility-compliance` |
| ESG / reporting | Listed or above size thresholds? | SEBI BRSR Core; CSRD (as amended); ISSB-based regimes | `regulatory/esg-reporting` |
| Corporate / tax nexus | New entity, branch, PE, stamp duty on documents? | Companies Act 2013; Income-tax (PE, equalisation levy history); state stamp acts (IN-STAMP-01) | `corporate/entity-compliance-calendar` |

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Licence before launch | All required licences/registrations obtained or applied with regulator comfort | S1 | Delay launch or restructure (partner-licensed model) |
| Role analysis | Role under each regime stated with the facts | S2 | Run role analysis before obligations |
| Thresholds | Each threshold tested with numbers | S3 | Mark Conditional and ask for data |
| Commencement | Volatile dates cited with ID and `[verify current]` | S3 | Verify live |
| Localisation conflicts | Architecture reconciled with RBI/sector/DPDPA s.16 rules | S2 (S1 for payment data) | Design change or regulator clarification |
| Sanctions/export nexus | USD, US-origin tech, EU persons checked | S1 if exposure unscreened | `regulatory/sanctions-screening` |
| Omitted regimes | Each "No" has the reason | S4 | Add reason |
| Owners | Every regime has a function owner | S3 | Assign |

## Output

Lead with `Regimes in scope: <n> (blocking: <n>) - <the one gating item>`. Then the output contract. Add between Findings and Actions:

**Regime map**

| Regime | Jurisdiction | Trigger fact | Our role | Status (applies / conditional / not applicable + reason) | Key obligations | Commencement (vol. ID) | Regulator | Owner | Hand-off skill |
|---|---|---|---|---|---|---|---|---|---|

**Interactions** - short list of overlaps, conflicts and precedence rules with authority.

For `depth: scan`, return only the regime map with status and trigger fact. JSON: one finding per regime that applies or is conditional (`category: "applicability"`).

## Edge cases & pitfalls

- **Long-arm reach**: GDPR Art. 3(2) targeting, DPDPA s.3(b) offering to principals in India, EU AI Act Art. 2(1)(c) where output is used in the EU, US sanctions via USD clearing - an Indian entity with no EU establishment can still be caught.
- **Group vs entity**: thresholds and licences usually attach per entity; do not aggregate unless the regime does (e.g. competition-law group, DPDPA SDF assessment by the government).
- **"Pilot" or "beta"** is not an exemption unless the regime says so (e.g. RBI regulatory sandbox participation, AI Act real-world testing conditions).
- **Guidance vs law**: mark non-binding guidance (e.g. India AI Governance Guidelines, Nov 2025) as such - it shapes regulator expectations but creates no obligation by itself.
- **Do not over-include**: a regime that does not apply is "not applicable" with a reason, not a finding.

## References

- Volatile facts: IN-DPDP-01..03, IN-CERTIN-01, IN-CCI-01, IN-LAB-01, IN-STAMP-01, EU-AIA-01..03, EU-GDPR-01, EU-DORA-01, EU-NIS2-01, US-SEC-01.
- GDPR Art. 3; DPDPA ss.3, 16, 38; EU AI Act Art. 2; Competition Act 2002 s.5 and s.32; FEMA 1999 s.6.
