# Default Clause Checklist and Fallback Ladders

Used by `contracts/contract-review` when the organisation playbook is silent. Positions are written for the **customer/buyer** role first, then the **supplier** view. Severities are defaults; re-score by our role and deal value. All ladders run from preferred (P) through fallbacks (F1, F2) to walk-away (W).

## 1. Limitation of liability

**Customer**
- P: Mutual cap ≥ greater of a fixed sum and 200% of annual fees; separate super-cap (≥ 3× annual fees) for data protection, confidentiality and security breaches; unlimited for fraud, death/personal injury caused by negligence, wilful misconduct, wilful abandonment, IP indemnity.
- F1: 150% of annual fees with fixed floor; super-cap 2×.
- F2: 100% of annual fees (fees paid or payable over the whole term if term < 12 months) with floor; data super-cap retained.
- W: Cap below fees payable in 12 months, or no carve-out for fraud/death/personal injury.
- Checks: per-claim vs aggregate; "paid" vs "paid or payable"; cap resets annually?; does cap include service credits? (customer: credits outside the cap).

**Supplier**
- P: 100% of fees paid in the 12 months before the claim; exclusion of indirect loss, lost profit, data loss; no uncapped heads beyond those the law forbids excluding.
- W: Uncapped liability for data breach or any indemnity other than IP infringement.

Law notes: liability for fraud cannot be excluded in England (*general principle*, see *HIH Casualty v Chase Manhattan Bank* [2003] UKHL 6 on fraud of the party itself); UCTA 1977 s.2(1) bars excluding negligent death/personal injury. In India no UCTA equivalent applies between businesses; exclusions are read strictly and contrary to public policy limits under s.23 ICA `[general principle — verify]`.

## 2. Indirect and consequential loss

- P (customer): Mutual exclusion of indirect/consequential loss, with express statement that the following are direct and recoverable: costs of procuring replacement services, data restoration costs, regulator-imposed fines and penalties to the extent lawfully recoverable, reasonable costs of breach notification and credit monitoring, wasted expenditure.
- F1: Same list without fines.
- W: Exclusion of "loss of data" or "loss of profit, whether direct or indirect" where the service hosts our data or drives our revenue.
- Interpretation: in English law "consequential" historically maps to the second limb of *Hadley v Baxendale* (1854) 9 Exch 341; courts increasingly read the clause in context. In India, s.73 ICA codifies a similar remoteness test (losses that naturally arose or were in contemplation). Listing heads expressly avoids the argument.

## 3. Indemnities

| Head | Customer wants | Supplier gives at most | Default if wrong |
|---|---|---|---|
| IP infringement (third-party claims) | Uncapped or super-capped; supplier to procure right, modify, or refund | Capped at super-cap; exclusions for customer modifications, combinations, customer specs | S2 |
| Data protection / security breach | Super-capped; covers regulatory fines (where lawful), notification costs, third-party claims | Only to the extent caused by supplier breach of the DPA | S2 |
| Third-party bodily injury / property damage | Uncapped for death/PI | Insured amount | S3 |
| Breach of law / anti-bribery | Covered | Limited to own breach | S3 |
| Supplier personnel (employment claims, TUPE in UK, contract labour in India) | Covered | Limited | S2 if on-site staff |

Procedural must-haves: prompt notice (failure only reduces indemnity to the extent of prejudice), conduct of claim to indemnitor with indemnitee's consent to settlements admitting liability, duty to mitigate, no double recovery.

Red flags: indemnities for "any breach of this Agreement" (turns every breach into an uncapped debt claim), indemnities for the indemnitee's own negligence (customer giving one = S1), indemnity triggers on "allegation" rather than claim.

## 4. Intellectual property

- P (customer): Customer owns all deliverables and work product created specifically for it (assignment on creation, moral-rights waiver/consent where law allows, further-assurance clause). Supplier retains background IP and grants a perpetual, irrevocable, royalty-free, worldwide, transferable-within-group licence to use it as embedded in deliverables.
- F1: Supplier owns, customer gets exclusive perpetual licence in its field.
- W: Customer's data, trademarks or pre-existing IP licensed or assigned beyond what is needed to perform; supplier right to use customer data to train models without opt-in.
- India: assignment of copyright must be in writing and specify rights, territory and duration; if duration is not stated it is deemed 5 years and territory deemed India (Copyright Act 1957, s.19(5)–(6)). Draft "for the full term of copyright, worldwide".
- AI: if supplier uses generative AI to produce deliverables, require disclosure, warranty of right to assign, and indemnity → `ip/copyright-assessment`.

## 5. Data protection and security

- P: Separate DPA meeting GDPR Art. 28(3) / UK GDPR / DPDPA s.8 requirements; security schedule with named standards (ISO/IEC 27001, SOC 2 Type II); breach notice to us within 24–48 hours of awareness, early enough for us to meet CERT-In's 6-hour window (`IN-CERTIN-01`) and GDPR 72 hours (`EU-GDPR-01`); sub-processor list with objection right; data location and transfer terms; return/deletion on exit with certificate.
- W: Supplier processes regulated personal data with no data terms; supplier may use data for its own purposes.
- Hand off to `privacy/dpa-review` and, for transfers, `privacy/cross-border-transfer`.

## 6. Termination and exit

- Customer P: For convenience on 30–90 days' notice (pay for work done); for cause on material breach uncured within 30 days; for persistent SLA failure; on counterparty change of control; on insolvency event (subject to local law — in India the IBC 2016 moratorium (s.14) and essential-supplies protections can restrict termination against a corporate debtor `[general principle — verify]`); for regulator direction.
- Exit assistance: continuation for up to 6–12 months at existing rates, data migration, knowledge transfer.
- Supplier P: Termination for non-payment after notice; no customer convenience right without termination fee; suspension right for non-payment.
- W (customer): Locked-in critical service with no exit right and no data return.

## 7. Payment and pricing

- Customer: 45–60 days from receipt of valid invoice; good-faith dispute withholding of disputed portion only; set-off right; price fixed for initial term; increases capped at CPI or a fixed %; taxes — supplier responsible for its own income taxes; GST/VAT shown separately; withholding tax gross-up refused.
- India: MSME supplier → payment within agreed period not exceeding 45 days, else compound interest at three times the RBI bank rate (MSMED Act 2006, ss.15–16) — buyer clause stating longer terms is ineffective against a registered micro/small enterprise. Also check the income-tax deduction rule for MSME payments beyond the statutory period `[verify current]` (Income-tax Act 2025 in force 1 Apr 2026; section numbering changed — `IN-TAX-01`).
- EU: Directive 2011/7/EU (late payment) — B2B terms over 60 days only if expressly agreed and not grossly unfair; public authorities 30 days (60 max).

## 8. Warranties

Customer list: services with reasonable skill and care by suitably qualified personnel; deliverables conform to specification for a warranty period (90 days–12 months); compliance with applicable law and our policies; no malware; non-infringement; authority and capacity; open-source disclosure; accuracy of tender responses. Remedies: re-performance, then price reduction/refund, without prejudice to other remedies.
Supplier: exclusive remedy; disclaim implied terms (UK SGSA 1982/SGA 1979 implied terms can be excluded B2B subject to UCTA reasonableness; US UCC §2-316 conspicuousness; India Sale of Goods Act 1930 s.62 allows exclusion by express agreement).

## 9. Assignment and change of control

- No assignment or novation without consent; we may assign to an affiliate or successor on reorganisation; counterparty change of control (especially to our competitor) gives us a termination right.
- Watch: assignment "including by operation of law or change of control" (catches our own M&A); receivables assignment bans may be ineffective in some jurisdictions (UK Business Contract Terms (Assignment of Receivables) Regulations 2018; US UCC §9-406) `[general principle — verify]`.
- → `contracts/amendment-assignment-novation` for instruments.

## 10. Governing law and disputes

- Choose a law we can advise on. For Indian counterparties with Indian assets, Indian law + arbitration seated in India (or SIAC/ICC with seat in Singapore/London for foreign parties) — check enforceability against counterparty assets (New York Convention; India enforces foreign awards from notified reciprocating territories under Part II of the A&C Act 1996).
- Two Indian parties: choosing foreign law is contentious; foreign seat is permitted (*PASL Wind Solutions v GE Power Conversion India* (2021) — Supreme Court) `[unverified]`.
- Unilateral arbitrator-appointment clauses in contracts with Indian public-sector undertakings are problematic after *Central Organisation for Railway Electrification v ECI SPIC SMO MCML (JV)*, 2024 INSC 857 (Constitution Bench, 8 Nov 2024) — applies prospectively to appointments after that date `[verify]`.
- → `contracts/dispute-resolution-clause`.

## 11. Insurance

Supplier maintains with reputable insurers: professional indemnity / E&O, public and products liability, employer's liability / workers' compensation (statutory), cyber liability, crime/fidelity (for cash or data handling). Levels ≥ the relevant cap. Certificates on request; notice of cancellation; not a cap on liability.

## 12. Audit and regulator access

Customer: audit of records, security controls and compliance on reasonable notice; regulator access mandatory for regulated outsourcing (RBI outsourcing directions for banks/NBFCs; SEBI cyber framework for regulated entities; DORA Art. 30(3)(e) for EU financial entities). Supplier: once per year, 30 days' notice, during business hours, confidentiality, customer bears cost unless material non-compliance found.

## 13. Subcontracting

Prior consent for subcontracting material obligations; supplier remains responsible; flow-down of confidentiality, data, audit, compliance; list of approved subcontractors in a schedule. For personal data, sub-processor terms in DPA govern.

## 14. Force majeure

Defined list plus general limb; excludes events foreseeable or mitigable by supplier BCP; excludes payment obligations; prompt notice; mitigation duty; either party may terminate after continuous FM of 30–90 days. India: absent a clause, s.56 ICA frustration applies narrowly `[general principle — verify]`; pandemic and cyber-attack treatment should be express.

## 15. Regulatory add-ons (trigger on facts)

| Trigger | Add | Skill |
|---|---|---|
| Counterparty acts on our behalf with officials | Anti-bribery clause, audit, termination; PCA 1988 s.9 (corporate offence) adequate-procedures defence | `regulatory/anti-bribery` |
| Cross-border goods/tech | Sanctions and export-control compliance, end-use undertaking | `regulatory/sanctions-screening`, `regulatory/export-controls` |
| UK nexus, large org | Modern Slavery Act 2015 s.54; Economic Crime and Corporate Transparency Act 2023 failure-to-prevent-fraud (in force 1 Sep 2025, `UK-ECCTA-01`) | `contracts/sustainability-clauses` |
| Exclusivity, MFN, territorial restrictions | Competition Act 2002 s.3(4) (India), TFEU Art. 101 / VBER | `regulatory/competition-merger-control` |
| AI system supplied | Model/data provenance, EU AI Act role allocation, no training on our data | `regulatory/ai-governance` |
| Financial-sector customer | RBI/SEBI/IRDAI outsourcing, DORA | `regulatory/financial-services-india`, `regulatory/operational-resilience` |

## 16. Boilerplate that matters

- Entire agreement — must not exclude liability for fraudulent misrepresentation.
- Order of precedence — our negotiated terms over order forms and online terms.
- Notices — valid email notice for operational matters; physical or registered delivery for termination/claims.
- Survival — list clauses.
- Counterparts and electronic signature — check legal validity in each execution jurisdiction (India: IT Act 2000 s.10A; excluded documents in First Schedule).
- Third-party rights — UK Contracts (Rights of Third Parties) Act 1999 exclusion unless affiliates need to enforce.
