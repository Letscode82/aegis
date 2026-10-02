---
name: privacy-dpa-review
description: >-
  Reviews or drafts a data processing agreement against GDPR/UK GDPR Art. 28(3) mandatory content, DPDPA s.8
  processor expectations and the organisation's minimums: instructions, confidentiality, security,
  sub-processors, assistance, breach notice timing, deletion, audit and international transfers. Use when a
  vendor or customer sends a DPA, data protection addendum or processing schedule, or a contract shares personal
  data without one. Not for the commercial MSA itself → contracts/contract-review; transfer mechanism and TIA
  → privacy/cross-border-transfer.
module: privacy
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: document
    required: true
    description: The DPA / addendum and, if available, the main agreement it attaches to.
  - name: our_role
    required: false
    description: Controller/Data Fiduciary (buying a service) or Processor (providing one). Inferred if absent.
  - name: processing_details
    required: false
    description: Data categories, data subjects, purposes, locations, sub-processors, duration.
  - name: playbook
    required: false
    description: Organisation's DPA minimums. Falls back to the defaults below.
  - name: sector
    required: false
    description: Regulated sector (bank, NBFC, insurer, listed entity, health) - adds outsourcing and audit clauses.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/saas-and-cloud-review, contracts/vendor-due-diligence, contracts/redline-generator, privacy/cross-border-transfer, privacy/dpdpa-compliance, privacy/gdpr-compliance, privacy/breach-response, regulatory/financial-services-india]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# DPA Review

Checks a data processing agreement clause by clause against the law that applies to the data and against our playbook, from the side we are on. The user gets a decision (SIGN / NEGOTIATE / ESCALATE), the missing statutory content, and replacement text for each gap. Where no DPA exists, the skill drafts the minimum schedule.

## When to use / not use

- Use: vendor DPAs (we are controller/fiduciary), customer DPAs (we are processor), intra-group data processing agreements, processing schedules inside MSAs, sub-processor flow-down terms.
- Hand off: commercial terms, caps and indemnities in the MSA → `contracts/contract-review` (note DPA liability carve-outs back to it); SCCs/IDTA/TIA → `privacy/cross-border-transfer`; supplier risk tiering → `contracts/vendor-due-diligence`; RBI/IRDAI outsourcing clauses → `regulatory/financial-services-india`.

## Inputs to collect first

1. **Our role**. Controller-side we want control and assurance; processor-side we want workable, capped obligations. Re-check: a vendor that uses data for its own purposes (product improvement, model training, benchmarking) is a controller/fiduciary for that purpose - the DPA must either prohibit it or document it as a separate controller-to-controller flow.
2. **Laws engaged** - where data subjects/principals are, establishment of each party, and sector.
3. **Data sensitivity and volume** - special category, children, financial, Aadhaar, health, credentials.
4. **Transfers** - processing locations and sub-processor locations.

## Method

1. **Identify the regime set** (GDPR/UK GDPR if EU/UK establishment or targeting; DPDPA if Indian digital personal data; US state laws if consumers in those states; sector overlays). Each adds mandatory content.
2. **Run the Art. 28(3) checklist** (where GDPR/UK GDPR applies). Every item is mandatory - each absence is S2 controller-side (statutory non-compliance by both parties), S3 processor-side unless it creates direct processor liability.
3. **Run DPDPA processor expectations**: s.8(2) - fiduciary may engage a processor only under a valid contract; s.8(1) - fiduciary stays responsible for processor acts; s.8(5)/Rule 6 - reasonable security safeguards and contractual provisions with processors to that effect; s.8(6)/Rule 7 - breach intimation (processor must notify fiduciary fast enough to meet "without delay" + 72h Board report); s.8(7) - erasure on purpose end/withdrawal including by the processor; s.6(6) - withdrawal of consent flows to processors. Commencement IN-DPDP-03 `[verify current]` - but contracts signed now will run past it, so draft to the standard now.
4. **Run the playbook checks** (table below) and US state processor terms (e.g. CCPA "service provider" contract terms, Va./Colo. processor contract content) where applicable.
5. **Score from our side**, then decide:
   - **SIGN** - nothing above S4.
   - **NEGOTIATE** - highest S3, or S2 with a standard fallback.
   - **ESCALATE** - any S1; vendor refuses mandatory Art. 28(3) content; sensitive data with no audit right; offshore transfer of RBI-regulated payment data; vendor claims right to train models on our personal data.
6. **Draft edits**: shortest replacement text keyed to clause numbers; for absent content, propose an insert.

## GDPR Art. 28(3) mandatory content

| # | Requirement | Authority |
|---|---|---|
| 1 | Subject matter, duration, nature, purpose, data types, categories of data subjects, controller obligations and rights | Art. 28(3) chapeau |
| 2 | Process only on documented instructions, incl. on transfers; notify if legally required to process otherwise | Art. 28(3)(a) |
| 3 | Personnel under confidentiality | Art. 28(3)(b) |
| 4 | Art. 32 security measures | Art. 28(3)(c) |
| 5 | Sub-processor conditions: prior specific or general written authorisation, notice of changes with right to object, same obligations flowed down, processor remains liable | Art. 28(2), (3)(d), (4) |
| 6 | Assist with data subject rights | Art. 28(3)(e) |
| 7 | Assist with Arts. 32-36 (security, breach notice, DPIA, prior consultation) | Art. 28(3)(f) |
| 8 | Delete or return at end of services, delete copies unless law requires storage | Art. 28(3)(g) |
| 9 | Make available information to demonstrate compliance; allow and contribute to audits and inspections | Art. 28(3)(h) |
| 10 | Inform controller if an instruction infringes law | Art. 28(3) final para |

Also: Art. 33(2) - processor notifies controller "without undue delay" after becoming aware of a breach. Commission SCCs between controllers and processors (Implementing Decision (EU) 2021/915) may be used as the Art. 28 contract.

## Checks

| Issue | Good position (controller-side) | Default severity | Fallback / processor-side note |
|---|---|---|---|
| Processing details schedule | Complete Annex: data, subjects, purposes, duration, locations | S3 | Fill from vendor questionnaire |
| Instructions | Only documented instructions; no vendor own-purpose use | S2 | Narrow carve-out for aggregated, de-identified service metrics only |
| AI / model training on our data | Prohibited without separate written consent | S1 where personal or confidential data | Opt-in, de-identified, excluded from foundation-model training |
| Confidentiality of personnel | Written duty for all with access | S3 | - |
| Security | Specific annex (encryption at rest/in transit, access control, logging, MFA, pen-testing); DPDP Rule 6 minimums incl. 1-year log retention | S2 | Certifications (ISO 27001, SOC 2 Type II) + annex |
| Breach notice to us | Without undue delay and in any case ≤24h of awareness, with content and cooperation; 6h where we are subject to CERT-In and the vendor operates our systems | S2 (S1 if no breach clause) | ≤48h with initial notice ≤24h. Processor-side: accept "without undue delay", resist hard hours <24 |
| Sub-processors | List annexed; ≥30 days' notice of change; right to object and terminate; flow-down; vendor liable | S2 | 15 days' notice; termination right without penalty |
| Data subject / principal rights assistance | Timely assistance (e.g. within 5 business days) at no extra cost for reasonable volumes | S3 | Reasonable cost recovery above threshold |
| DPIA / regulator assistance | Assist with DPIA, SDF audit, Board/regulator inquiries | S3 | - |
| Deletion / return | Within 30 days of end; certificate; backups deleted on cycle | S2 | 90 days for backups with continued protection |
| Audit | Reports + on-site/remote audit on reasonable notice; regulator audit rights (RBI/IRDAI/SEBI) unlimited | S2 (S1 for regulated outsourcing without regulator access) | Third-party report first, on-site once a year or after a breach |
| International transfers | Locations listed; no transfer without consent; SCCs/IDTA where needed; DPDPA restricted-country check; sector localisation | S2 (S1 if payment data offshore against RBI rule) | `privacy/cross-border-transfer` |
| Government access requests | Notify us (where lawful), challenge overbroad requests, transparency | S3 | - |
| Liability | DPA breaches not hidden under a low general cap; super-cap for data breaches | S2 → refer to `contracts/contract-review` | Super-cap 2-3× fees or fixed amount |
| Indemnity for regulatory fines | Where lawful and insurable | S3 | Cost of notification and remediation instead |
| Order of precedence | DPA prevails over MSA on data protection | S3 | - |
| Term / survival | Survives while vendor holds data | S4 | - |
| US state terms | CCPA service-provider restrictions (no selling/sharing, no combining, certification) where CA consumers | S2 | - |

## India-specific checks

- **Fiduciary liability is not transferable** (s.8(1)) - indemnity and audit rights are the only real protection; insist on both for sensitive data.
- **Processor-to-processor chains**: DPDPA does not regulate sub-processors directly; flow-down must come from contract.
- **Sector outsourcing**: RBI outsourcing directions (financial services and IT services) require, among others, regulator access/inspection rights, confidentiality and data localisation where applicable; IRDAI and SEBI have equivalents. Missing regulator audit right = S1 for a regulated entity.
- **CERT-In Directions (28 Apr 2022)**: vendors operating ICT for us should keep logs within India for 180 days and support 6h reporting (IN-CERTIN-01).
- **Stamp duty** on the DPA if executed as a separate instrument in India (IN-STAMP-01).

## Output

Lead with `Decision: SIGN | NEGOTIATE | ESCALATE - <reason>`. Then the output contract. Add:

- **Art. 28(3) / DPDPA coverage grid** - requirement · present? · clause · gap.
- **Proposed edits** block, e.g.:

```
cl. 7.1 - replace "within a reasonable time" with
"without undue delay and in any event within 24 hours of becoming aware of a Personal Data Breach, providing the information in Annex 4 as it becomes available"
```

## Edge cases & pitfalls

- **Joint controllers / independent controllers** (e.g. payment processors, auditors, ad networks): an Art. 28 DPA is the wrong instrument - use Art. 26 arrangement or controller-to-controller terms.
- **"Vendor may update the DPA by posting online"**: unilateral change of mandatory terms = S2; require notice and termination right.
- **Data "anonymised" by vendor for its use**: test the anonymisation claim; pseudonymised data remains personal.
- **Liability caps in DPAs** that are lower than the MSA cap - check which prevails.
- **Processor-side**: resist unlimited audit, uncapped indemnities, hard breach clocks under 24h, and obligations to follow instructions that conflict with law.
- Do not accept a vendor's statement that "DPDPA does not apply to processors" as the end of the analysis - the fiduciary must contract for compliance.

## References

- Volatile facts: IN-DPDP-03, IN-CERTIN-01, EU-GDPR-01, IN-STAMP-01.
- GDPR Arts. 26, 28, 32-36, 44-46; Commission Implementing Decisions (EU) 2021/914 (transfer SCCs) and 2021/915 (Art. 28 SCCs); DPDPA ss.6(6), 8; DPDP Rules 2025 Rules 6-7; Cal. Civ. Code §1798.100(d), §1798.140(ag).
