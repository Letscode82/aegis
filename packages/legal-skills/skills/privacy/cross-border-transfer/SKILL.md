---
name: privacy-cross-border-transfer
description: >-
  Assesses an international personal-data transfer and picks a lawful mechanism: GDPR/UK adequacy, SCCs + a transfer
  risk assessment (TIA), BCRs or an Art. 49 derogation, plus India DPDP cross-border rules and data-localisation
  overlays (RBI, sectoral). Use to clear a data export, choose SCCs vs adequacy, run a TIA, or map transfers in a
  SaaS/sub-processor chain. Not for the whole GDPR programme → privacy/gdpr-compliance; not for a single processor
  contract's terms → privacy/dpa-review.
module: privacy
version: 1.0.0
jurisdictions: [EU, UK, IN]
risk_tier: review-required
inputs:
  - name: transfer
    required: true
    description: What data moves, from where to where, between which entities (controller/processor/sub-processor), and for what purpose.
  - name: data
    required: false
    description: Categories of personal data (incl. special-category), volume, and the data subjects affected.
  - name: destination_facts
    required: false
    description: The importer's country, any adequacy status, the local surveillance/government-access regime, and the importer's role.
  - name: mechanism_in_use
    required: false
    description: Any mechanism already relied on (adequacy, SCCs, BCRs, derogation) and whether a TIA was done.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/dpa-review, privacy/data-subject-requests, privacy/dpdpa-compliance, contracts/saas-and-cloud-review, regulatory/financial-services-india]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Cross-Border Transfer Assessment

Takes a proposed personal-data export and returns a lawful transfer mechanism (or a stop), with the transfer-risk analysis and any localisation overlay that actually governs the route. The deliverable is a mechanism decision plus the conditions to make it lawful, not a tour of Chapter V.

## When to use / not use

- Use: clearing a transfer of personal data out of the EEA/UK (or into/out of India); choosing between adequacy, SCCs, BCRs and derogations; running a transfer risk assessment (TIA); mapping transfers across a SaaS/sub-processor chain.
- Hand off: the overall GDPR/UK programme → `privacy/gdpr-compliance`; the processor-contract terms themselves → `privacy/dpa-review`; India DPDP end to end → `privacy/dpdpa-compliance`; the SaaS agreement around it → `contracts/saas-and-cloud-review`; RBI/sectoral localisation in depth → `regulatory/financial-services-india`.

## Inputs to collect first

1. The transfer map: what data, from which exporter to which importer, in what role (controller/processor/sub-processor), for what purpose.
2. Data categories (flag special-category), volume, and the affected data subjects.
3. The destination country, its adequacy status, and its government-access/surveillance regime.
4. Any mechanism already in use and whether a TIA was completed.
5. Localisation overlays: sector (financial, health), and any data-residency requirement independent of GDPR.

## Method

1. **Confirm there is a "transfer".** Identify the exporter, the importer, and that personal data crosses a border (including remote access from abroad and sub-processor onward transfers). Intra-group and SaaS routes count.
2. **Check for adequacy first** — if the destination has an EU/UK adequacy decision, a transfer there needs no further mechanism (confirm the decision still stands and covers this transfer type) `[verify current]`. Adequacy is the cleanest route where available.
3. **No adequacy → pick an Art. 46 safeguard.** Usually the **SCCs** (EU 2021 modules by role; UK IDTA or the UK Addendum to the EU SCCs). Select the correct module for the exporter/importer roles; BCRs for large intra-group programmes.
4. **Run the Transfer Risk Assessment (TIA).** Post-*Schrems II*, SCCs alone are not enough: assess the destination's law and practice (government access, redress), and whether it undermines the SCC protections. Where it does, add **supplementary measures** (encryption with keys held outside the destination, pseudonymisation, split processing) or don't transfer. Document the TIA.
5. **Derogations are the narrow exception, not a routine basis.** Art. 49 (explicit consent, contract necessity, important public interest, legal claims) is for occasional, non-repetitive transfers — never the backbone of a systematic data flow.
6. **Overlay India DPDP and localisation.** DPDP permits transfers except to countries the government restricts, and sectoral rules can be stricter: **RBI payments-data localisation** requires certain payment data to be stored in India; health and other sectors may add residency duties. A GDPR-lawful export can still breach a localisation rule, and vice versa — check both directions `[verify current]`.
7. **Trace the sub-processor chain.** A compliant top-level transfer is undone by an uncovered onward transfer; require the importer to flow the mechanism down and disclose sub-processor locations → `contracts/saas-and-cloud-review`.
8. **Record and operationalise** — the mechanism, the TIA, the supplementary measures, and the trigger to re-assess (new adequacy decision, new case law, importer change).
9. **Score against the Checks table** and set a decision: **TRANSFER PERMITTED / PERMITTED WITH MEASURES / DO NOT TRANSFER**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Transfer with no Chapter V mechanism at all | Adequacy, SCCs/IDTA, BCRs or a valid derogation | S1 | Stop the transfer until a mechanism is in place |
| SCCs relied on with no TIA (post-Schrems II) | TIA done; supplementary measures where needed | S1 | Run the TIA; add measures or halt |
| Wrong SCC module / wrong UK instrument for the roles | Correct module (role-matched) + UK IDTA/Addendum | S2 | Re-paper with the right instrument |
| Localisation rule breached (e.g. RBI payments data) | Residency duty checked alongside GDPR | S1 | Localise the data or restructure the flow |
| Derogation used as a routine transfer basis | Derogations only for occasional/non-repetitive | S2 | Move to an Art. 46 safeguard |
| Sub-processor onward transfer uncovered | Mechanism flowed down the whole chain | S2 | Require flow-down + sub-processor locations |
| Special-category data transferred without heightened measures | Extra safeguards for sensitive data | S2 | Add measures or restrict |
| No re-assessment trigger | Review on new adequacy/case-law/importer change | S3 | Add the monitoring trigger |

## Output

Lead with `Decision: TRANSFER PERMITTED | PERMITTED WITH MEASURES | DO NOT TRANSFER — <route> — <key reason>`. Then the output contract. Add:

- **Transfer map**: exporter → importer, roles, data, destination, purpose.
- **Mechanism**: the chosen basis + why; the TIA conclusion; any supplementary measures required.
- **Localisation overlay**: any residency rule that governs independently of GDPR.
- **Sub-processor note**: flow-down status down the chain.
- One JSON finding per issue with `category: "cross-border-transfer"`.

## Edge cases & pitfalls

- **Remote access is a transfer**: support staff abroad viewing EEA data is an export even if nothing is "sent".
- **Adequacy is not forever**: adequacy decisions can be challenged or lapse; don't treat a current decision as permanent — set a re-assessment trigger.
- **GDPR-lawful ≠ localisation-lawful**: an export can satisfy Chapter V and still breach RBI/sectoral residency — check both.
- **SCCs are a floor, not a shield**: *Schrems II* means the destination's actual law matters; skipping the TIA is the common, serious gap.
- **Consent derogation misuse**: building a systematic transfer on Art. 49 consent is fragile and usually wrong — reserve it for genuine one-offs.

## References

- Volatile facts: `EU-GDPR-01` where breach-timing interacts; `IN-DPDP-03`/`IN-DPDP-06` for India commencement/retention. Cite live where an adequacy status or localisation rule is load-bearing; mark `[verify current]`.
- GDPR Chapter V (Arts. 44–49) + EU SCCs (2021); UK IDTA / Addendum; *Schrems II* and EDPB supplementary-measures guidance; India DPDP Act 2023 cross-border provisions; RBI payments-data localisation.
