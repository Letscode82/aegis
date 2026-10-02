---
name: contracts-vendor-due-diligence
description: >-
  Risk-tiers a supplier and runs proportionate legal, privacy, security, sanctions, anti-bribery, financial and
  ESG checks, returning a tier, red flags, required contract protections and an approve / approve-with-conditions /
  reject recommendation. Use when onboarding or renewing a vendor, outsourcing a function, or someone asks "can we
  use this supplier". Not for reviewing the vendor's contract → contracts/contract-review; adjudicating a sanctions
  hit → regulatory/sanctions-screening.
module: contracts
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: vendor_profile
    required: true
    description: Legal name, registration number, country, ownership and beneficial owners, group structure, website.
  - name: engagement
    required: true
    description: What the vendor will do, data and systems access, locations of service and data, criticality, annual value, term.
  - name: questionnaire
    required: false
    description: Completed vendor questionnaire, certifications (ISO/IEC 27001, SOC 2), policies, financial statements.
  - name: screening_results
    required: false
    description: Sanctions / PEP / adverse-media screening output, corporate registry extracts, credit reports.
  - name: our_sector
    required: false
    description: Regulated status of our entity (bank, NBFC, insurer, listed company, EU financial entity, critical infrastructure).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/saas-and-cloud-review, regulatory/sanctions-screening, regulatory/anti-bribery, regulatory/export-controls, regulatory/financial-services-india, regulatory/operational-resilience, regulatory/security-frameworks, privacy/dpa-review, privacy/cross-border-transfer, regulatory/ai-governance, contracts/sustainability-clauses]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Vendor Due Diligence

Diligence effort should match what the vendor can break. This skill sets an inherent-risk tier from the engagement facts, runs only the checks that tier demands, reads the evidence (not just the questionnaire's self-assessment), and converts what it finds into an approval decision and specific contractual protections for `contracts/contract-review` to enforce.

## When to use / not use

- Use: new vendor onboarding; renewal or scope expansion; change of vendor ownership; outsourcing of a regulated or critical function; re-assessment after an incident or adverse media.
- Hand off: contract terms → `contracts/contract-review` / `contracts/saas-and-cloud-review`; sanctions or PEP match adjudication → `regulatory/sanctions-screening`; intermediary/agent risk deep-dive → `regulatory/anti-bribery`; security control mapping → `regulatory/security-frameworks`; DPA → `privacy/dpa-review`.

## Inputs to collect first

1. **Engagement facts** that set the tier: data access (none / business / personal / sensitive or regulated), system access (none / read / privileged / network), criticality (could its failure stop a critical service?), interaction with government officials on our behalf, physical presence on our sites, annual spend.
2. **Vendor identity**: exact legal entity contracting, country of incorporation, ultimate beneficial owners (≥10% or controlling), parent group.
3. **Our regulatory status** — it adds mandatory checks (RBI, SEBI, IRDAI, DORA, NIS2).

## Method

1. **Verify identity.** Match legal name and registration number to the registry (India: MCA master data — CIN, status "Active", directors' DIN status, charges; GSTIN validity on the GST portal; Udyam registration if claimed MSME). Mismatch between contracting entity and screened entity → S2 until resolved.
2. **Set inherent tier** (before any controls):

| Tier | Any of | Checks required |
|---|---|---|
| **T1 Critical** | Supports a critical/important function; regulated outsourcing; privileged access to production; sensitive personal data at scale; acts with government officials for us | All checks, evidence-based; onsite or independent assurance; exec approval |
| **T2 High** | Personal data; network/system access; spend above the high threshold; single-source dependency | All checks except onsite; independent assurance report |
| **T3 Moderate** | Business confidential data only; moderate spend | Identity, sanctions, ABC questionnaire, basic security, financial |
| **T4 Low** | No data, no access, low spend, easily replaced | Identity and sanctions only |

3. **Run checks for the tier** (table below). Prefer primary evidence (registry, certificate, audit report, financials) over self-declaration; record the evidence date. Evidence older than 12 months → `medium` confidence.
4. **Score residual risk** per domain using `_shared/severity-scale.md` with likelihood (Red/Amber/Green matrix), from our perspective.
5. **Decide**:
   - **APPROVE** — no domain above Green, or Amber with standard contract terms.
   - **APPROVE WITH CONDITIONS** — Amber items fixed by contract protections, remediation plan with dates, or compensating controls. List each condition and owner.
   - **REJECT / ESCALATE** — any S1, confirmed sanctions match, unresolved bribery red flag, or Red in a domain for a T1/T2 vendor.
6. **Translate to contract protections** — for each Amber/Red item, the clause `contracts/contract-review` must secure (audit, security schedule, breach SLA, sub-processor control, step-in, exit, insurance level, ABC/sanctions warranties and termination rights).
7. **Set monitoring** — re-assessment cadence (T1 annually + continuous adverse-media; T2 annually; T3 every 2 years; T4 on renewal) and triggers (ownership change, breach, adverse media, sanctions designation).

## Checks

| Domain | Test / good position | Default severity if failed | Action |
|---|---|---|---|
| Sanctions & export | Entity, owners ≥ 50% (OFAC 50% rule; EU/UK ownership-and-control tests), directors screened against OFAC SDN, EU consolidated list, UK OFSI list, UN lists; India MHA lists under UAPA and the WMD Act 2005 `[verify current]`; no presence in comprehensively sanctioned territories | S1 on confirmed match | Stop; → `regulatory/sanctions-screening` |
| Anti-bribery & corruption | Interaction with officials, success fees, high-risk country, unusual payment routes, PEP owners; ABC policy and training; PCA 1988 s.9 (as amended 2018) makes a commercial organisation liable for associated persons' bribes unless adequate procedures; UK Bribery Act 2010 s.7; FCPA | S1 for red flags unexplained; S2 for no ABC programme in T1/T2 | → `regulatory/anti-bribery`; ABC clauses, audit, termination |
| Fraud (UK nexus) | Large organisations face failure-to-prevent-fraud liability for associated persons (ECCTA 2023 s.199, in force 1 Sep 2025, `UK-ECCTA-01`) | S3 | Fraud-prevention warranty and audit |
| Information security | ISO/IEC 27001 certificate (scope covers the service) or SOC 2 Type II (period, exceptions, carve-outs, CUECs); pen-test summary; vulnerability management; MFA; logging; incident response | S2 for T1/T2 without independent assurance | Security schedule; right to audit; remediation plan |
| Incident reporting | Can notify us fast enough for CERT-In 6 h (`IN-CERTIN-01`), GDPR 72 h (`EU-GDPR-01`), NIS2 24 h (`EU-NIS2-01`), SEC 8-K (`US-SEC-01`) | S2 | Breach-notice SLA in hours |
| Privacy | Role (processor/sub-processor), data map, locations, sub-processors, transfer mechanism, DPDPA processor obligations under s.8 (phased, `IN-DPDP-03`), GDPR Art. 28 | S2 | → `privacy/dpa-review`, `privacy/cross-border-transfer` |
| Data localisation (sector) | RBI payment-system data storage in India (RBI circular of 6 Apr 2018) for payment system operators and their service providers `[verify current]`; other sector rules (insurance, telecom, government cloud) | S1 if mandatory and unmet | Contractual location commitment; architecture review |
| Regulated outsourcing — India | RBI outsourcing directions for banks/NBFCs (IT and financial-services outsourcing) — materiality assessment, board-approved policy, no outsourcing of core management functions, regulator access, BCP; SEBI cybersecurity and cyber-resilience framework for regulated entities; IRDAI outsourcing regulations `[verify current]` | S1 if mandatory element missing for a material outsourcing | → `regulatory/financial-services-india` |
| Regulated outsourcing — EU | DORA: ICT third-party risk, pre-contract assessment, register of information, Art. 30 contract terms, concentration risk (`EU-DORA-01`); EBA outsourcing guidelines | S1 if Art. 30 terms impossible to obtain for critical/important function | → `regulatory/operational-resilience` |
| Ownership / land-border | Beneficial owner in a country sharing a land border with India — public procurement registration requirement (GFR Rule 144(xi)) and heightened scrutiny `[verify current]`; FDI route issues if equity involved | S2 | Escalate; confirm eligibility |
| Financial stability | Last 2–3 years' audited financials: going concern, net worth, revenue concentration, debt; India: MCA filings current, charges, IBC proceedings (NCLT cause lists / IBBI) | S2 for T1 (failure = service loss) | Parent guarantee, escrow (source code/data), step-in, exit plan |
| Litigation & regulatory history | Material litigation, regulator penalties, data-breach history, debarment lists (World Bank, government blacklists) | S2–S3 | Explain or reject |
| Legal standing | Licences/registrations required for the service (e.g. contract labour licence for on-site staff, payment aggregator authorisation, telecom licence) | S2 | Evidence before go-live |
| Labour & human rights | Contract labour compliance in India (Labour Codes in force 21 Nov 2025, `IN-LAB-01`) — wages, social-security contributions for deployed staff; UK Modern Slavery Act 2015 s.54; EU CSDDD scope where applicable `[verify current]` | S2 for on-site manpower vendors | Compliance warranties, monthly challans evidence, indemnity |
| ESG / value chain | BRSR Core value-chain disclosure for top-1000 listed entities (SEBI) `[verify current]`; supplier code of conduct acceptance | S3 | → `contracts/sustainability-clauses` |
| AI use | Vendor uses AI on our data/outputs: training opt-out, model provenance, EU AI Act role, accuracy and human oversight | S2 if our data used for training without consent | → `regulatory/ai-governance` |
| Concentration / exit | Substitutability, data portability, notice periods, dependency on vendor's subcontractors (4th parties) | S2 for T1 | Exit plan, escrow, multi-sourcing |
| Conflict of interest | Employee or director links to vendor; related party (Companies Act 2013 s.188; SEBI LODR Reg. 23 for listed) | S2 | Disclose; approvals |

Detailed questionnaire and evidence list by tier: `references/evidence-by-tier.md`.

## Output

Line one: `Decision: APPROVE | APPROVE WITH CONDITIONS | REJECT/ESCALATE — Tier T<n>, residual <Red/Amber/Green>` then `Draft — requires lawyer review`. Follow `_shared/output-contract.md` (findings carry `likelihood`). Insert between Findings and Actions:

1. **Tier rationale** — the engagement facts that set the tier.
2. **Domain heatmap** — domain · evidence seen (with date) · residual rating.
3. **Required contract protections** — list keyed to findings, for `contracts/contract-review`.
4. **Conditions & monitoring** — condition, owner, due date, re-assessment date and triggers.

## Edge cases & pitfalls

- **Questionnaire theatre**: a "yes" to "do you have an incident response plan?" is not evidence. For T1/T2, ask for the document or the auditor's report.
- **Certificate scope**: ISO 27001 for a different entity, site or service does not cover this engagement. SOC 2 Type I is a point-in-time design opinion — not operating effectiveness.
- **Reseller / marketplace**: diligence the actual service provider and the hosting provider, not just the contracting reseller.
- **Group entities**: the screened parent may not be the contracting subsidiary; sanctions ownership aggregates across owners.
- **Individual freelancers / sole proprietors**: collect only the personal data needed for checks; DPDPA notice applies to them as data principals.
- **Renewals** are not rubber stamps: re-run sanctions and adverse media every time; re-tier if scope changed.
- Never record a sanctions or criminal-record result for an individual beyond what the check requires; keep results in the AEGIS restricted field.
