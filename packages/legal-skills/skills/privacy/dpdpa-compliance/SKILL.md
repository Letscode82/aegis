---
name: privacy-dpdpa-compliance
description: >-
  Gap assessment and implementation plan under India's Digital Personal Data Protection Act 2023 and DPDP Rules
  2025: applicability, notice, consent, legitimate uses, children, SDF duties, rights, breach, retention,
  cross-border and penalties, phased to the commencement dates. Use when asked "are we DPDPA ready", to assess a
  process, product or vendor flow for Indian personal data, or to build a DPDPA programme. Not for GDPR-only
  work → privacy/gdpr-compliance; live incidents → privacy/breach-response.
module: privacy
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: scope
    required: true
    description: Entity, business line, product or processing activity to assess (or "enterprise-wide").
  - name: data_inventory
    required: false
    description: RoPA / data map - categories of data principals and data, purposes, systems, processors, transfers, retention.
  - name: artefacts
    required: false
    description: Current privacy notice, consent flows/screens, processor contracts, breach SOP, retention schedule, rights-handling SOP.
  - name: role
    required: false
    description: Data Fiduciary, Data Processor, Consent Manager or a mix. Inferred from the inventory if absent.
  - name: sdf_status
    required: false
    description: Whether notified (or likely to be notified) as a Significant Data Fiduciary under s.10.
  - name: sector
    required: false
    description: Sector regulator overlays (RBI, SEBI, IRDAI, health, telecom) - these can be stricter (s.16(2), s.38).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/privacy-notice-drafter, privacy/dpa-review, privacy/breach-response, privacy/privacy-impact-assessment, privacy/data-subject-requests, privacy/cross-border-transfer, privacy/gdpr-compliance, regulatory/financial-services-india, regulatory/security-frameworks]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# DPDPA Compliance

Assesses an organisation, product or processing activity against the Digital Personal Data Protection Act 2023 (DPDPA) and the DPDP Rules 2025 (G.S.R. 846(E), notified 13 Nov 2025), and returns a prioritised gap list tied to the date each obligation actually bites. The user gets a defensible readiness rating, the fixes ranked by penalty exposure, and the hand-offs (notice drafting, DPA, breach SOP) needed to close them.

## When to use / not use

- Use for: DPDPA readiness assessments; reviewing a new product/journey that collects Indian personal data; designing consent, children or rights workflows; SDF readiness; board updates on DPDPA status.
- Hand off: notice text → `privacy/privacy-notice-drafter`; processor contracts → `privacy/dpa-review`; an actual breach → `privacy/breach-response`; high-risk new processing → `privacy/privacy-impact-assessment`; EU/UK data → `privacy/gdpr-compliance`; transfer mechanics → `privacy/cross-border-transfer`; RBI/SEBI/IRDAI localisation and outsourcing → `regulatory/financial-services-india`.

## Inputs to collect first

1. **Role** for each activity: Data Fiduciary (decides purpose and means, s.2), Data Processor (processes on behalf), or Consent Manager. Role decides which duties apply - processors have no direct DPDPA duties except via contract and security expectations.
2. **Data is digital?** DPDPA covers personal data collected in digital form, or collected non-digitally and later digitised (s.3(a)). Purely paper records never digitised are out.
3. **Who are the Data Principals**: customers, employees, children (<18), persons with disability, non-residents.
4. **Ground relied on** per purpose: consent (s.6) or a legitimate use (s.7).
5. **Processors, Consent Managers and transfers** outside India.
6. **SDF status** and sector regulator.

If the inventory is missing, run the method on what is known and list the inventory itself as the first S2 action.

## Method

1. **Applicability (s.3, s.17)**.
   - In scope if digital personal data is processed in India, or outside India in connection with offering goods/services to Data Principals in India (s.3(b)). Profiling alone outside India without an offering is not caught - say so.
   - Excluded: personal/domestic purposes; personal data made publicly available by the Data Principal or under a legal obligation (s.3(c)). Scraped "public" data qualifies only if the principal (or a law) made it public - document the source.
   - **Exemptions** (s.17): legal claims, courts, offence prevention/investigation, court-approved schemes (amalgamation etc.), loan-default financial checks; **s.17(1)(d)** - processing in India of non-residents' data under a contract with a person outside India (GCC/BPO model) is exempt from most of Chapters II-III but **not** from s.8(1) and s.8(5) security. Confirm the exemption fits exactly; partial fit = no exemption.
2. **Phase the obligations** using commencement - this drives severity *today*:
   - In force since notification (IN-DPDP-01): definitions, Board machinery (Act ss.18-26 etc.; Rules 1, 2, 17-21).
   - Consent Manager registration - Rule 4 and s.6(9)/s.27(1)(d) (IN-DPDP-02).
   - Core fiduciary duties - Rules 3, 5-16, 22, 23 and Act ss.3-17, 27-34 (IN-DPDP-03). Until then, IT Act s.43A + SPDI Rules 2011 continue (s.44(2) repeals them from the same date).
   - Rule: a gap against an obligation not yet in force is scored on readiness (normally one level lower than at commencement) unless commencement is under 6 months away, in which case score at full severity. All dates `[verify current]` - an announced proposal to compress SDF timelines and bring forward transfer restrictions was reported in Jan 2026 with no amending instrument located (proposed IN-DPDP-04).
3. **Ground per purpose (s.4)**. For each purpose, confirm consent or a s.7 legitimate use. Legitimate uses are closed: (a) data voluntarily provided for a specified purpose where the principal has not objected; (b)-(c) State subsidies/functions; (d)-(e) legal obligation/court orders; (f)-(h) medical emergency, epidemic, disaster/public order; (i) **employment** purposes or safeguarding the employer (espionage, trade secrets, IP) or providing a benefit the employee sought. There is no "legitimate interests" ground - a GDPR LIA cannot be ported.
4. **Notice (s.5, Rule 3)**: standalone, clear, plain language; itemised description of personal data and the specified purpose with itemised goods/services; link/means to withdraw consent (as easy as giving it), exercise rights, and complain to the Board. Available in English or any Eighth Schedule language on request (s.5(3)). For data collected before commencement on consent, a s.5(2) notice is due "as soon as reasonably practicable".
5. **Consent (s.6)**: free, specific, informed, unconditional, unambiguous, clear affirmative action, limited to data necessary for the purpose. Bundled consent, pre-ticked boxes and "consent to anything unlawful" are invalid to that extent (s.6(2)). Withdrawal stops processing within a reasonable time and must flow to processors (s.6(6)). Burden of proving notice and consent is on the fiduciary (s.6(10)) - require consent logs.
6. **Children & disability (s.9, Rules 10-12)**: verifiable parental consent for under-18s using reliable identity/age details already held or a virtual token/DigiLocker-type provider (Rule 10); no processing likely to harm a child's well-being; **no tracking, behavioural monitoring or targeted advertising directed at children** (s.9(3)) unless a Fourth Schedule exemption applies (Rule 12: e.g. healthcare, education, creches, child safety, email-account creation). Guardian verification for persons with disability (Rule 11).
7. **General duties (s.8, Rules 6-9)**: accuracy where data drives decisions or is shared; reasonable security safeguards - Rule 6 minimums: encryption/obfuscation/masking/tokenisation, access control, logging and monitoring, continuity/backups, **retain logs and personal data for one year** for detection and investigation, processor contracts with safeguards, organisational measures; erasure when purpose ends; publish DPO/contact (Rule 9); grievance mechanism.
8. **Retention & erasure (s.8(7)-(8), Rule 8, Third Schedule)**: e-commerce and social media intermediaries with ≥2 crore registered users and online gaming intermediaries with ≥50 lakh users must erase after 3 years from last approach/activity, with **48 hours' prior notice** to the principal. Rule 8(3) separately requires keeping personal data, traffic data and logs for at least one year for Seventh Schedule purposes - reconcile both in the retention schedule.
9. **Rights (ss.11-14, Rule 14)**: access summary, correction/completion/updating/erasure, grievance redressal, nomination. Publish how to exercise; respond to grievances within a period not exceeding 90 days. Principal must exhaust the fiduciary's grievance route before the Board (s.13(3)).
10. **SDF (s.10, Rule 13)**: India-based DPO answerable to the board, independent data auditor, DPIA and audit **every 12 months** with significant observations reported to the Board, due diligence that algorithmic software is not likely to risk principals' rights, and any localisation of data classes the Government specifies on committee recommendation. If not notified but plausibly in scope (volume, sensitivity, risk to rights, sovereignty, electoral democracy, public order) → treat as "SDF-ready" track.
11. **Cross-border (s.16, Rule 15)**: transfers allowed except to countries the Government restricts (negative list) and subject to requirements it specifies for transfers to foreign States/entities; stricter sector rules prevail (s.16(2)) - RBI payment-data localisation, SEBI, IRDAI, telecom. No SCC-equivalent is required by DPDPA itself, but contracts still need flow-down.
12. **Breach (s.8(6), Rule 7)**: every personal data breach - **no risk threshold** - to each affected principal without delay and to the Board without delay, with a detailed report within 72 hours (or longer if the Board allows). Check the SOP aligns with CERT-In 6h (IN-CERTIN-01) → `privacy/breach-response`.
13. **Score and roll up** with `_shared/severity-scale.md`, anchoring S-levels to the Schedule penalty band (below). Overall rating = highest finding; three or more S2s in one area roll up to S1.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Data inventory / RoPA | Every purpose mapped to data, ground, system, processor, retention, transfer | S2 | Build inventory first; scope interim to top-5 journeys |
| Ground per purpose | Consent or a named s.7 clause; no "legitimate interest" | S2 (S1 if children/sensitive at scale) | Re-paper to consent or a s.7 use; stop processing with no ground |
| Notice content | Rule 3 itemisation, withdrawal/rights/Board links, standalone | S2 | `privacy/privacy-notice-drafter` |
| Consent quality | Granular, unbundled, affirmative, logged | S2 | Redesign UI; keep consent ledger with version and timestamp |
| Withdrawal | As easy as giving; propagates to processors | S3 | Add self-serve withdrawal and processor flow-down |
| Consent Manager integration | Interoperable if offered; CM registered (Rule 4, First Schedule incl. ₹2 crore net worth for CM) | S3 | Track IN-DPDP-02 |
| Children | Age-gating, verifiable parental consent, no targeted ads/tracking | S1 | Switch off ads/tracking for minors; implement Rule 10 method |
| Security safeguards | Rule 6 minimums + 1-year logs + processor clauses | S1 (max ₹250 cr band) | `regulatory/security-frameworks`; prioritise encryption and logging |
| Breach SOP | Dual-track Board + principals, 72h report, CERT-In 6h | S1 (₹200 cr band) | `privacy/breach-response` to build SOP |
| Retention | Purpose-based schedule; Third Schedule 3-yr/48h notice where applicable; 1-yr minimum logs | S2 | Retention schedule with auto-deletion and notice job |
| Rights handling | Published channel, identity check, ≤90 days, nomination | S3 | `privacy/data-subject-requests` |
| DPO / contact | Published contact (all); India-based DPO (SDF) | S3 / S2 for SDF | Appoint and publish |
| SDF programme | 12-monthly DPIA + independent audit + algorithmic due diligence | S2 (₹150 cr band) | `privacy/privacy-impact-assessment` annual cycle |
| Processor contracts | Valid contract for every processor (s.8(2)), safeguards, erasure, breach notice | S2 | `privacy/dpa-review` |
| Cross-border | No transfer to restricted country; sector localisation honoured | S2 (S1 if RBI payment data offshore) | `privacy/cross-border-transfer` |
| Employee data | s.7(i) mapped; monitoring proportionate; notice to staff | S3 | Update HR privacy notice |
| Legacy (pre-commencement) data | s.5(2) notice plan; erase where no ground | S3 | Campaign before IN-DPDP-03 |

## Penalty anchors (Schedule to the Act, s.33)

| Breach | Maximum penalty |
|---|---|
| Failure to take reasonable security safeguards (s.8(5)) | ₹250 crore |
| Failure to intimate breach to Board or principals (s.8(6)) | ₹200 crore |
| Additional obligations for children (s.9) | ₹200 crore |
| SDF additional obligations (s.10) | ₹150 crore |
| Breach of a voluntary undertaking accepted by the Board (s.32) | Up to the amount for the underlying breach |
| Any other provision of the Act or Rules | ₹50 crore |
| Data Principal duties (s.15) | ₹10,000 |

Penalties are per instance and the Board weighs nature, gravity, duration, gain/loss avoided, mitigation, proportionality (s.33(2)). Appeals lie to TDSAT within 60 days (s.29). Voluntary undertakings (s.32) are a settlement tool - flag as an option when an inquiry starts.

## India-specific overlays

- **SPDI Rules transition**: until IN-DPDP-03, s.43A IT Act and SPDI Rules 2011 still govern "sensitive personal data" (passwords, financial, health, biometrics, sexual orientation) - do not treat them as repealed.
- **Sector regulators**: RBI (payment data storage in India, outsourcing and IT governance directions), SEBI (CSCRF), IRDAI (cyber guidelines), health (ABDM), telecom (Telecommunications Act 2023). DPDPA is additional, and on conflict DPDPA prevails (s.38) except where a law gives a higher degree of protection or restricts transfers (s.16(2)).
- **CERT-In Directions (28 Apr 2022)**: 180-day log retention within India and 6h incident reporting run alongside Rule 6/7.
- **No private damages route under DPDPA**: civil courts are barred (s.39); compensation claims may still be argued under other law `[general principle — verify]`.

## Output

Lead with `DPDPA readiness: RED | AMBER | GREEN - <one reason>` (Red = any S1 or rolled-up S1; Amber = highest S2; Green = S3 or lower). Then the output contract. Add:

- **Phased plan table**: obligation · Act/Rule · commencement (cite IN-DPDP-xx `[verify current]`) · gap · owner · target date (≥60 days before commencement).
- **Per-purpose ground register**: purpose · data · ground (consent / s.7 clause) · notice ref · retention.
- In JSON, set `authority` to Act section and Rule number; `likelihood` reflects enforcement proximity.

## Edge cases & pitfalls

- **GDPR transplant**: no legitimate interests, no special-category regime, no DPIA for non-SDFs, no contractual necessity ground - flag every ported GDPR concept.
- **"Publicly available" scraping** for AI training: only exempt if made public by the principal or under law; scraped data posted by third parties about the principal is not.
- **Group companies** are separate fiduciaries; intra-group sharing needs a ground and a contract.
- **Processor-turned-fiduciary**: a vendor that reuses data for its own analytics/model training is a fiduciary for that purpose.
- **Children**: "under 18", not 13 or 16 - global age gates set at 13 are non-compliant for India.
- **Date drift**: some sources compute commencement as 13 vs 14 Nov / May. Use the volatile-facts row and state it.
- Do not cite Rule numbers 17-23 for substantive duties; they concern the Board, appeals and information calls (Seventh Schedule).

## References

- `references/dpdpa-rules-map.md` - section/rule map with commencement phase.
- Volatile facts: IN-DPDP-01, IN-DPDP-02, IN-DPDP-03, IN-CERTIN-01; proposed IN-DPDP-04.
- Primary: DPDP Act 2023 (No. 22 of 2023); DPDP Rules 2025, G.S.R. 846(E), Gazette of India, 13 Nov 2025 (meity.gov.in).
