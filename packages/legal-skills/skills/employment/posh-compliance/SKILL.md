---
name: employment-posh-compliance
description: >-
  Checks compliance with India's Sexual Harassment of Women at Workplace (POSH) Act: Internal Committee constitution
  (composition, external member, quorum), the complaint and inquiry procedure and timelines, interim reliefs,
  confidentiality, annual reporting and the policy/training mandate. Use to set up or audit POSH compliance, or to run
  an inquiry to procedure. Not for a general grievance/misconduct investigation → employment/workplace-investigation;
  not for drafting the standalone policy text → employment/employment-policy-drafter.
module: employment
version: 1.0.0
jurisdictions: [IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of compliance-audit (assess the org's POSH setup), inquiry-guide (run a specific complaint to the statutory procedure) or setup (stand up IC + policy + reporting from scratch).
  - name: organisation
    required: false
    description: Employee count and locations/branches, the current Internal Committee composition, the POSH policy status, and training/reporting history.
  - name: complaint
    required: false
    description: For inquiry mode — the complaint (respondent, timing, nature), whether within the limitation period, and any interim-relief need.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/workplace-investigation, employment/employment-policy-drafter, regulatory/whistleblower-programme, corporate/corporate-governance-review, employment/india-labour-codes]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# POSH Compliance & Inquiry

Takes an organisation (or a specific complaint) and returns whether its POSH set-up meets the Act and how to run an inquiry to procedure: a correctly constituted Internal Committee, the statutory inquiry steps and timelines, confidentiality and interim reliefs, and the reporting/policy/training mandate. The deliverable is a compliance determination or a procedure-correct inquiry plan, not a general harassment-policy summary.

## When to use / not use

- Use: auditing an Indian employer's POSH compliance; constituting or fixing an Internal Committee; running a POSH complaint through the statutory inquiry correctly; preparing the annual report and the policy/training obligations.
- Hand off: a general (non-POSH) grievance, misconduct, or whistleblowing investigation → `employment/workplace-investigation`; drafting the standalone policy document → `employment/employment-policy-drafter`; the whistleblowing/speak-up channel design → `regulatory/whistleblower-programme`; board-level oversight of the control → `corporate/corporate-governance-review`; broader labour-code obligations → `employment/india-labour-codes`.

## Inputs to collect first

1. **Employee count and locations** — 10+ employees requires an **Internal Committee (IC)** at each workplace; multiple branches/offices each need their own IC `[verify current]`.
2. The **current IC composition** (presiding officer, members, external member) and whether members' terms are valid.
3. The **policy, display, and training** status.
4. **For a complaint:** the respondent, the timing (limitation), the nature of the allegation, and any interim-relief need.

## Method

1. **Confirm the IC is validly constituted.** An IC needs: a **Presiding Officer** who is a **senior woman** employee; at least **two members** committed to the cause / with legal/social-work experience; and **one external member** from an NGO/association familiar with sexual-harassment issues. At least **half** the members must be women. A defectively constituted IC can void the whole inquiry `[verify current]`.
2. **Check jurisdiction and limitation.** The complaint must be a woman aggrieved at the workplace; it must normally be filed **within 3 months** (extendable by a further 3 months for sufficient cause). Confirm the IC (not an LC/employer panel) has jurisdiction.
3. **Offer conciliation only on request.** The IC may attempt conciliation **if the complainant requests it** — but **not** with a monetary settlement as a basis, and only before the inquiry; don't impose it.
4. **Run the inquiry to procedure.** Supply the complaint to the respondent (typically within 7 working days), allow a reply, follow **principles of natural justice** (both sides heard, documents/witnesses, right to represent — but **no lawyer** as of right), maintain the balance-of-probabilities standard, and complete the inquiry within **90 days**.
5. **Handle interim reliefs.** During pendency the IC may recommend interim measures — transfer, leave (up to 3 months), or restraining the respondent from reporting on the complainant's work — on the complainant's request.
6. **Protect confidentiality.** The identity of the complainant, respondent, witnesses, and the proceedings are confidential; breach carries a penalty. Publication/disclosure is restricted.
7. **Report and recommend.** The IC submits its report within **10 days** of completing the inquiry; the employer must act on the recommendation (disciplinary action / compensation deduction) within the prescribed time; guard against **malicious** complaints (but mere inability to prove is not malice).
8. **Meet the standing obligations.** A displayed **policy**, **annual report** to the District Officer (and the number of cases in the directors'/Board report where applicable), and regular **awareness/training** for employees and IC members.
9. **Score against the Checks table** and set a determination: **COMPLIANT / GAPS TO FIX / NON-COMPLIANT** (audit) or a **procedure-correct inquiry plan** (inquiry mode).

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| IC absent or defectively constituted | Presiding senior woman + members + external + ≥½ women | S1 | Reconstitute the IC before any inquiry `[verify current]` |
| No IC at a branch with 10+ employees | An IC at each qualifying workplace | S1 | Constitute per location |
| Limitation / jurisdiction not checked | 3-month (extendable) window + IC jurisdiction confirmed | S2 | Confirm timing and forum |
| Conciliation imposed / money-based | Only on request, pre-inquiry, non-monetary basis | S2 | Correct the conciliation handling |
| Natural justice not followed | Both heard; documents/witnesses; no lawyer-as-right | S1 | Re-run the step properly |
| 90-day inquiry / 10-day report timelines missed | Statutory timelines tracked | S2 | Diarise and complete on time |
| Interim relief not offered on request | Transfer/leave/restraint considered | S2 | Offer the interim measure |
| Confidentiality breached | Identities + proceedings kept confidential | S1 | Lock down disclosure |
| Policy / annual report / training missing | Displayed policy + annual report + training | S2 | Close the standing-obligation gaps |

## Output

Lead with `POSH: COMPLIANT | GAPS TO FIX | NON-COMPLIANT — <org> — <top gap>` (or `Inquiry plan: <complaint> — next step + deadline`). Then the output contract. Add:

- **IC constitution**: composition check (presiding officer / external member / women majority) per location.
- **Procedure** (inquiry mode): the steps, the 90-day/10-day timelines, interim reliefs, confidentiality.
- **Standing obligations**: policy display, annual report, training status.
- One JSON finding per gap with `category: "posh"`.

## Edge cases & pitfalls

- **Defective IC voids the inquiry**: missing the external member, the senior-woman presiding officer, or the women-majority is the most common fatal defect — fix constitution first.
- **Branch-level ICs**: a single head-office IC doesn't cover other workplaces with 10+ employees — each needs its own.
- **Conciliation misuse**: imposing conciliation, or settling for money, is non-compliant — it's only on the complainant's request and not monetary.
- **Lawyer at the hearing**: parties have a right to represent themselves but **not** to be represented by a lawyer as of right — a common procedural error.
- **"Couldn't prove it" ≠ malicious**: penalising a complainant for a failed-but-genuine complaint is itself a breach; malice needs a specific finding.

## References

- Volatile facts: cite `[verify current]` where IC-composition, the limitation window, or reporting thresholds under the POSH Act / Rules are load-bearing; `IN-LAB-01` where labour-code interactions apply.
- The Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act 2013 and Rules; relevant Supreme Court/High Court guidance on IC constitution and natural justice.
