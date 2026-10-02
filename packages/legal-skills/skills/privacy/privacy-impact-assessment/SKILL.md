---
name: privacy-privacy-impact-assessment
description: >-
  Runs a regime-agnostic privacy impact assessment (DPIA/PIA): screens whether one is mandatory, describes the
  processing, tests necessity and proportionality, scores risks to individuals, sets mitigations and records
  residual risk and sign-off. Use for new products, AI/analytics use cases, monitoring, vendor onboarding with
  personal data, GDPR Art. 35 DPIAs or DPDPA SDF annual assessments. Not for a whole-programme gap review →
  privacy/dpdpa-compliance or privacy/gdpr-compliance; AI Act FRIA → regulatory/ai-governance.
module: privacy
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: processing_description
    required: true
    description: What the project does with personal data - purpose, data, people, systems, vendors, flows, retention.
  - name: jurisdictions
    required: false
    description: Where the data principals / subjects are and which entities process. Drives the mandatory triggers.
  - name: artefacts
    required: false
    description: Architecture diagram, data flow, vendor DPAs, security assessment, prior DPIAs, LIA, model card.
  - name: stakeholders
    required: false
    description: Business owner, DPO, CISO, and any consultation already done with affected people.
  - name: risk_appetite
    required: false
    description: Organisation's privacy risk appetite statement; defaults to "no residual Red without DPO and GC sign-off".
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/dpdpa-compliance, privacy/gdpr-compliance, privacy/legitimate-interest-assessment, privacy/cross-border-transfer, privacy/dpa-review, regulatory/ai-governance, contracts/vendor-due-diligence, regulatory/security-frameworks]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Privacy Impact Assessment

Produces a complete, signable privacy impact assessment for a single project, system or change. It decides first whether an assessment is legally required (and under which regime), then works through description, necessity, risk to individuals and mitigation, ending with a residual-risk call and the sign-off chain. The output doubles as the GDPR Art. 35 record, the DPDPA s.10 / Rule 13 SDF assessment, or an internal PIA where no law requires one.

## When to use / not use

- Use: new product or feature, new vendor/processor holding personal data, new monitoring (employee, CCTV, telematics), AI/ML training or inference on personal data, data sharing or monetisation, material change to an existing processing.
- Hand off: enterprise-wide gap review → `privacy/dpdpa-compliance` / `privacy/gdpr-compliance`; legitimate-interest balancing → `privacy/legitimate-interest-assessment`; transfer impact assessment → `privacy/cross-border-transfer`; EU AI Act fundamental-rights impact assessment (Art. 27) or AI risk classification → `regulatory/ai-governance` (run both and cross-reference).

## Inputs to collect first

1. Purpose(s) in one sentence each and the business benefit.
2. Data categories, including special category / sensitive / children / biometrics / precise location / financial.
3. Population and scale (numbers, geographies, vulnerable groups).
4. Systems, vendors and transfers.
5. Any automated decision with legal or similarly significant effect.
6. Whether the project is already live (a retrospective PIA changes the actions: remediate rather than design).

## Method

1. **Screen - is an assessment mandatory?** Apply the triggers table below. Record the result even if "not required" (accountability). If any regime requires it → mandatory; else run a proportionate "light" PIA (steps 2, 4, 6 only) unless two or more risk indicators apply.
2. **Describe the processing**: purpose, data, data subjects, sources, recipients, systems, retention, transfers, lawful basis/ground per purpose. Pull from the RoPA; flag inconsistencies between RoPA and the project description as S3 findings.
3. **Necessity and proportionality**:
   - Is each data element needed for the purpose? (minimisation) - any "nice to have" field is a finding.
   - Could a less intrusive means achieve the purpose (aggregation, pseudonymisation, on-device, shorter retention)?
   - Lawful basis / ground valid? GDPR Art. 6 (+ Art. 9/10); DPDPA consent or s.7 legitimate use (no legitimate-interests ground in India); US state law opt-out/opt-in rights for sensitive data and targeted advertising.
   - Transparency: will notice actually reach people before collection?
   - Rights: can access, correction, erasure, objection/opt-out be honoured technically?
4. **Identify risks to individuals** (not to the company): use the risk catalogue below. For each, state source, harm, affected group.
5. **Score** each risk with the 3×4 matrix in `_shared/severity-scale.md`: impact (S1-S4 harm to individuals) × likelihood (likely / possible / remote with a one-line reason).
6. **Mitigate**: for each Amber/Red, specify a control, owner and date; re-score to get residual risk. Controls must be concrete (e.g. "field-level encryption of Aadhaar number with HSM keys") not generic ("appropriate security").
7. **Decide**:
   - **PROCEED** - all residual risks Green/Amber with owners.
   - **PROCEED WITH CONDITIONS** - Amber residuals with conditions that must close before go-live; list them as blocking actions.
   - **DO NOT PROCEED / CONSULT** - any residual Red. Under GDPR Art. 36, prior consultation with the supervisory authority is required where high residual risk remains; under DPDPA (SDF) report significant observations to the Board per Rule 13 `[verify current]`.
8. **Sign-off and review**: record DPO advice (GDPR Art. 35(2)), business owner acceptance, and review date (default 12 months, or on material change; mandatory 12-monthly for SDFs).

## Mandatory triggers

| Regime | Trigger | Authority |
|---|---|---|
| EU/UK GDPR | Processing "likely to result in a high risk"; always for systematic extensive profiling with legal/significant effects, large-scale special-category/criminal data, systematic monitoring of public areas | GDPR Art. 35(1), (3); national DPA lists under Art. 35(4); EDPB WP248 rev.01 nine criteria (two or more → presume DPIA) |
| India DPDPA | SDF: DPIA and audit once every 12 months; others: not mandated but recommended for high-risk processing | DPDPA s.10(2)(c); DPDP Rules 2025 Rule 13 (IN-DPDP-03 `[verify current]`) |
| California | Risk assessments for processing presenting significant risk (CPPA regulations on risk assessments, ADMT and cybersecurity audits) | Cal. Civ. Code §1798.185; CCPA regulations `[verify current]` |
| Other US states (VA, CO, CT, TX etc.) | Data protection assessment for targeted advertising, sale, profiling with significant risk, sensitive data | e.g. Va. Code §59.1-580; Colo. Rev. Stat. §6-1-1309 |
| EU AI Act | Deployer FRIA for certain Annex III high-risk systems; DPIA can be complemented | AI Act Art. 27 (EU-AIA-03 timing `[verify current]`) |
| Sector | RBI/SEBI outsourcing and IT risk assessments; health data (ABDM) | Sector directions |

## Risk catalogue

| Risk to individuals | Typical source | Default impact |
|---|---|---|
| Unauthorised access / breach | Weak access control, vendor, exposed storage | S1 if sensitive/financial/children at scale; else S2 |
| Function creep / secondary use | Reuse for analytics, model training, marketing | S2 |
| Discrimination / unfair outcome | Automated decisions, proxies for protected traits | S1 where legal/similar effect (credit, hiring, insurance) |
| Loss of control / opacity | No notice, dark patterns, bundled consent | S2 |
| Excessive surveillance / chilling effect | Employee monitoring, location, keystroke logging | S2 (S1 if covert) |
| Re-identification | "Anonymised" datasets, linkage | S2 |
| Inaccuracy | Stale data used for decisions | S3 (S2 if decision-driving) |
| Inability to exercise rights | No deletion path in data lake / model weights | S3 |
| Children's well-being | Profiling, ads to minors | S1 |
| Unlawful transfer / foreign access | Offshore storage, government access risk | S2 |
| Excess retention | No deletion schedule | S3 |

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Screening documented | Trigger analysis recorded per regime | S3 | Record screening outcome |
| Description complete | Data, purpose, flows, vendors, retention all stated | S3 | Return to business owner with gap list |
| Lawful basis / ground | Valid basis per purpose; no ported GDPR LI for India | S2 | Re-paper basis; `privacy/legitimate-interest-assessment` where GDPR |
| Minimisation | Each field justified | S3 | Remove or pseudonymise field |
| Automated decisions | Human review, explanation, contest route (GDPR Art. 22) | S2 | Add human-in-the-loop and notice |
| Security controls | Mapped to data sensitivity | S2 | `regulatory/security-frameworks` |
| Vendors | DPA in place with Art. 28 / DPDPA s.8(2) content | S2 | `privacy/dpa-review` |
| Transfers | Mechanism + TIA; DPDPA negative list; sector localisation | S2 | `privacy/cross-border-transfer` |
| DPO consulted | Advice recorded and response to it | S3 (GDPR: S2) | Obtain written DPO view |
| Residual Red | Prior consultation / escalation path used | S1 | Stop; GC + DPO decision |
| Stakeholder views | Consulted affected people or representatives where appropriate (Art. 35(9)) | S4 | Note rationale if not |

## Output

Lead with `Decision: PROCEED | PROCEED WITH CONDITIONS | DO NOT PROCEED - <reason>`. Then the output contract, with these extra sections between Findings and Actions:

1. **Screening table** - regime · trigger met? · authority.
2. **Processing description** - compact table.
3. **Risk register** - risk · harm · group · impact · likelihood (reason) · inherent RAG · control · owner · residual RAG.
4. **Sign-off block** - DPO advice, business owner, GC (if residual Amber with S1 impact), review date.

JSON: each risk is a finding with `likelihood` set; `category: "privacy-risk"`.

## Edge cases & pitfalls

- **Scoring company risk instead of individual risk**: fines and reputation belong in the Bottom line, not in the risk score.
- **AI projects**: training data, inference data and outputs are separate processing operations - assess each. Memorisation and model-inversion are re-identification risks; deletion from trained weights is usually not feasible, so mitigate upstream.
- **Retrospective PIA** on a live system: actions become remediation with dates; do not pretend the design choice is still open.
- **Vendor-supplied DPIA templates** assess the vendor's controls, not our purpose and necessity - complete both.
- **Anonymisation claims**: test against singling-out, linkability and inference; pseudonymised data is still personal data (GDPR Recital 26) and under DPDPA if identifiable.
- **India**: no DPIA mandate for non-SDFs does not mean no risk - Rule 6 "reasonable security safeguards" is judged after the event; a documented PIA is the best evidence of reasonableness.

## References

- Volatile facts: IN-DPDP-03, EU-AIA-03.
- GDPR Arts. 5, 6, 9, 22, 25, 35, 36; EDPB/WP29 DPIA Guidelines (WP248 rev.01); DPDPA s.10; DPDP Rules 2025 Rule 13; ISO/IEC 29134 (PIA guidelines).
