---
name: regulatory-whistleblower-programme
description: >-
  Designs or audits a speak-up / whistleblower programme: reporting channels, confidentiality, anti-retaliation
  protection, investigation workflow and governance reporting, across the EU Whistleblowing Directive, UK PIDA, US
  (SOX / Dodd-Frank) and India (Companies Act vigil mechanism, SEBI LODR). Use to draft or update a whistleblower /
  speak-up policy, stand up a channel, or review a programme against the law. Not for investigating a single live
  report → employment/workplace-investigation; not for the channel's privacy notice → privacy/privacy-notice-drafter.
module: regulatory
version: 1.0.0
jurisdictions: [global, EU, UK, US, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (new policy/programme), audit (review an existing programme against the law) or channel (stand up / assess a reporting channel).
  - name: footprint
    required: false
    description: Where the organisation operates and headcount per country — drives which regimes bind (EU 50-employee threshold, India company class, US listing status).
  - name: existing_policy
    required: false
    description: Current whistleblowing / code-of-conduct / grievance policy and any channel vendor in use.
  - name: sector
    required: false
    description: Financial services, listed company, public sector, healthcare — adds sector duties (e.g. SEBI LODR, FCA SYSC 18, SOX audit committee).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [employment/workplace-investigation, disputes/regulatory-investigation, regulatory/anti-bribery, privacy/privacy-notice-drafter, drafting/policy-drafter, corporate/corporate-governance-review]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Whistleblower Programme

Builds or stress-tests a speak-up programme so reports surface internally, reach a competent handler, are investigated fairly, and never cost the reporter their job — then proves all of that on the record. The deliverable is a defensible programme (policy + channel + workflow + governance), not just a policy document.

## When to use / not use

- Use: drafting or refreshing a whistleblower / speak-up policy; choosing or assessing a reporting channel (hotline, web form, ombudsperson); mapping which regimes bind across the footprint; preparing the audit-committee / board view of the programme.
- Hand off: a specific report has come in and needs investigating → `employment/workplace-investigation` (people conduct) or `disputes/regulatory-investigation` (regulator-facing); bribery/corruption controls the programme feeds → `regulatory/anti-bribery`; the data-protection notice and retention for the channel → `privacy/privacy-notice-drafter`; the policy house style and approval → `drafting/policy-drafter`.

## Inputs to collect first

1. Countries of operation and headcount per country (sets the EU 50-worker threshold and group-sharing analysis).
2. Entity type: EU listing, US SEC registrant, Indian company class (listed / prescribed), regulated financial entity.
3. Who currently handles concerns, through what channels, and whether any are anonymous.
4. Existing policy, code of conduct, and the retaliation/grievance interface.
5. Scope intended: wrongdoing only, or the wider "any concern" speak-up culture.

## Method

1. **Map the binding regimes** across the footprint. State which apply and why:
   - **EU** — Directive (EU) 2019/1937 requires internal channels for legal entities with **50+ workers** (and all financial-services firms and public bodies regardless of size), acknowledgement within **7 days**, feedback within **3 months**, confidential handling, and a prohibition on retaliation with a reversed burden of proof. Transposition and detail vary by member state — treat the national transposing law as controlling and mark `[verify current]`.
   - **UK** — Public Interest Disclosure Act 1998 (in the Employment Rights Act 1996): protects "qualifying disclosures" in the public interest made to prescribed persons; no mandatory internal-channel statute for general employers, but FCA/PRA **SYSC 18** mandates channels for regulated firms.
   - **US** — SOX s.806 (anti-retaliation) and s.301 (audit-committee complaint procedures for listed companies); Dodd-Frank SEC whistleblower bounty and anti-retaliation; sector programmes.
   - **India** — Companies Act 2013 **s.177(9)-(10)** vigil mechanism (listed companies and prescribed classes; audit-committee oversight; direct access to the chair); **SEBI LODR Reg. 4(2)(d)(iv) / 22** for listed entities; the Whistle Blowers Protection Act 2014 covers public-sector disclosures and is **not** in general private-sector force — do not cite it as a private-employer duty `[verify current]`.
2. **Decide scope and reportable categories** — at minimum legal/regulatory breaches, fraud, bribery, safety, and harm to the public; say whether personal grievances route elsewhere.
3. **Design the channels** — multiple, accessible routes (web, phone, in person, to a named independent person), available to workers *and* often third parties (suppliers, contractors) where the regime requires; support anonymous reporting where lawful; allow external reporting to a competent authority without losing protection.
4. **Confidentiality & anonymity** — restrict access to reporter identity to the handler; separate the case file from HR records; state when identity may have to be revealed (legal compulsion) and that the reporter is told first where possible.
5. **Anti-retaliation** — prohibit detriment, name examples (dismissal, demotion, exclusion, informal freeze-out), extend protection to facilitators and witnesses, and reflect the **reversed burden** where it applies (the employer must show any detriment was unrelated).
6. **Triage & investigation workflow** — intake → acknowledge (≤7 days EU) → assess/triage → conflicts check → investigate or refer → outcome → feedback to reporter (≤3 months EU) → remediation. Keep the handler independent of the subject.
7. **Governance & reporting** — audit-committee / board oversight, periodic metrics (volume, categories, outcomes, time-to-close, substantiation rate), and programme review cadence.
8. **Data protection** — the channel processes personal data; require a lawful basis, a privacy notice, tight access, and defined retention (delete unfounded reports promptly; keep substantiated ones per policy). Cross-reference the DPA/DPDPA analysis.
9. **Score gaps** against the Checks table and set a decision: **APPROVE / APPROVE WITH CONDITIONS / REJECT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Mandatory internal channel missing (EU 50+, regulated firm, listed co.) | Compliant channel live in each in-scope entity | S1 | Stand up channel before go-live |
| No anti-retaliation protection / no reversed-burden reflected | Explicit prohibition + examples + burden shift where law requires | S1 | Add protection clause; train managers |
| Acknowledgement / feedback timelines absent | ≤7 days ack, ≤3 months feedback (EU) stated and tracked | S2 | Add SLA to workflow + case system |
| Confidentiality of reporter identity not guaranteed | Access-restricted handling; disclosure only on legal compulsion with notice | S2 | Re-architect access controls |
| No anonymous route where expected | Anonymous intake supported and lawful in-country | S3 (S2 where market-standard/required) | Add anonymous channel |
| Handler not independent of subject | Conflicts check + escalation to chair/audit committee | S2 | Add recusal + escalation path |
| Third parties excluded where regime includes them | Channel open to contractors/suppliers as required | S3 | Extend scope |
| No governance reporting | Periodic metrics to audit committee/board | S3 | Add reporting pack |
| Data protection not addressed | Lawful basis, notice, retention, access limits | S2 | `privacy/privacy-notice-drafter` + retention rule |
| No records / defensibility trail | Case log with timeline, decisions, outcomes | S2 | Adopt case-management system |

## Output

Lead with `Decision: APPROVE | APPROVE WITH CONDITIONS | REJECT — <key reason>`. Then the output contract. Add:

- **Applicability matrix**: entity / country · regime · threshold met? · key duty · status.
- **Gap list** mapped to the Checks table with owners and due dates.
- Draft mode: return the policy as a titled section (purpose, scope, channels, confidentiality, anti-retaliation, process & timelines, roles, data protection, review) plus a short manager/worker-facing summary. One JSON finding per gap with `category: "whistleblowing"`.

## Edge cases & pitfalls

- **Group sharing**: EU rules on whether group entities can share one channel are member-state-specific — do not assume a single group hotline satisfies every local law `[verify current]`.
- **Anonymous ≠ always lawful**: some jurisdictions restrict or discourage anonymous reports — check per country rather than defaulting to "anonymous everywhere".
- **India public vs private**: the Whistle Blowers Protection Act 2014 is a public-sector instrument; private-company duties flow from the Companies Act vigil mechanism and SEBI LODR, not that Act.
- **Personal grievances**: routing everything through the whistleblowing channel buries real wrongdoing — keep an HR grievance path and signpost it.
- **Retaliation by omission**: freeze-outs and missed promotions are detriment too; managers need training, not just a clause.

## References

- Volatile facts: cite live where a date/threshold is load-bearing; mark `[verify current]`.
- Directive (EU) 2019/1937; national transposing laws; Public Interest Disclosure Act 1998 (UK); FCA SYSC 18; SOX ss.301, 806; Dodd-Frank s.922; Companies Act 2013 s.177(9)-(10) and Rule 7 (Meetings of Board) (India); SEBI LODR Reg. 4/22.
