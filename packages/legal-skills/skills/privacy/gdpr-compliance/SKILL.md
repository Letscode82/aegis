---
name: privacy-gdpr-compliance
description: >-
  Builds or audits a GDPR / UK GDPR compliance programme end to end: lawful basis, records of processing (Art. 30),
  data-subject rights, security (Art. 32), breach notification (Art. 33/34), international transfers, DPO and DPIA
  triggers, and accountability evidence. Use to assess readiness, close gaps against the Regulation, or stand up the
  governance a supervisory authority expects. Not for a single DSAR → privacy/data-subject-requests; not for one
  processor contract → privacy/dpa-review; not for India DPDP → privacy/dpdpa-compliance.
module: privacy
version: 1.0.0
jurisdictions: [EU, UK]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of readiness (assess a programme against the Regulation), gap-audit (review existing controls) or standup (design a programme from scratch).
  - name: footprint
    required: false
    description: Where the organisation is established, where data subjects are, and whether it offers goods/services to or monitors people in the EU/UK (sets Art. 3 territorial scope and the Art. 27 representative duty).
  - name: processing_inventory
    required: false
    description: Current record of processing activities, systems, categories of data (incl. special-category / criminal), and processors in use.
  - name: role
    required: false
    description: Whether the organisation acts as controller, processor, or both for each activity — drives which obligations bind.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/data-subject-requests, privacy/privacy-impact-assessment, privacy/dpa-review, privacy/cross-border-transfer, privacy/breach-response, privacy/privacy-notice-drafter, privacy/dpdpa-compliance, regulatory/applicability-mapper]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# GDPR Compliance Programme

Turns "are we GDPR-compliant?" into a defensible, evidence-backed answer: which activities are in scope, on what lawful basis, with what rights-handling, security, breach drill, transfer mechanism and accountability record — and where the gaps are, ranked. The deliverable is a programme view plus a prioritised gap list, not a restatement of the Regulation.

## When to use / not use

- Use: assessing GDPR / UK GDPR readiness; auditing an existing programme; standing up accountability (Art. 30 records, policies, DPIA process, breach playbook) before a product launch, funding round, or customer security review.
- Hand off: fulfilling one access/erasure request → `privacy/data-subject-requests`; reviewing a single controller–processor contract → `privacy/dpa-review`; a specific high-risk processing assessment → `privacy/privacy-impact-assessment`; a transfer out of the EEA/UK → `privacy/cross-border-transfer`; a live breach → `privacy/breach-response`; drafting the external notice → `privacy/privacy-notice-drafter`; India DPDP → `privacy/dpdpa-compliance`.

## Inputs to collect first

1. Territorial-scope facts: establishment(s), whether offering goods/services to or monitoring EU/UK data subjects (Art. 3), and any Art. 27 representative.
2. Role per activity: controller, joint controller, or processor — the obligations differ.
3. The processing inventory: activities, purposes, data categories (flag special-category Art. 9 and criminal Art. 10), retention, recipients, processors.
4. Current controls: policies, DPIA process, breach playbook, DPA templates, transfer mechanism, security baseline.
5. Whether a DPO is appointed or required (Art. 37 triggers).

## Method

1. **Confirm scope and role.** Establish Art. 3 applicability and, per activity, whether the organisation is controller or processor. A processor's duties (Art. 28/30(2)/32/33(2)) are narrower than a controller's — do not apply controller obligations wholesale.
2. **Map lawful basis per purpose (Art. 6)** and, for special-category/criminal data, an Art. 9/10 condition on top. Consent must be freely given, specific, informed, unambiguous and withdrawable; legitimate interests needs an LIA → `privacy/legitimate-interest-assessment`. One basis per purpose; "we have consent *and* legitimate interest" is a red flag.
3. **Check transparency (Art. 13/14).** Is there a compliant privacy notice covering the Art. 13/14 content for each collection route? → `privacy/privacy-notice-drafter`.
4. **Records of processing (Art. 30).** Does the Art. 30 record exist, is it current, and does it distinguish controller vs processor activities? This is the backbone auditors ask for first.
5. **Data-subject rights operations.** Is there a route and an on-time process (one month, extendable by two) for access, rectification, erasure, restriction, portability, objection, and rights re automated decisions (Art. 22)? → `privacy/data-subject-requests`.
6. **Security (Art. 32).** Assess technical and organisational measures proportionate to risk: encryption/pseudonymisation, access control, resilience, testing. Map to the security framework if one is claimed → `regulatory/security-frameworks`.
7. **Breach readiness (Art. 33/34).** Is there a playbook meeting the **72-hour** supervisory-authority notification where feasible (cite `EU-GDPR-01` `[verify current]`) and the "high risk → notify individuals" trigger? → `privacy/breach-response`.
8. **International transfers.** For any transfer outside the EEA/UK, confirm an Art. 44–49 mechanism (adequacy, SCCs + transfer risk assessment, BCRs) → `privacy/cross-border-transfer`.
9. **DPIA process (Art. 35).** Is there a trigger test and a working DPIA process for high-risk processing? → `privacy/privacy-impact-assessment`.
10. **Governance & accountability.** DPO where required (Art. 37), processor contracts (Art. 28) in place → `privacy/dpa-review`, training, and documented decisions. Accountability (Art. 5(2)) means you can *show* compliance, not just assert it.
11. **Score each area** against the Checks table and set a programme decision: **APPROVE / APPROVE WITH CONDITIONS / REJECT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No lawful basis mapped per purpose | One valid Art. 6 basis (+ Art. 9/10 where needed) per purpose | S1 | Map basis; stop processing with none |
| Special-category data without an Art. 9 condition | Explicit condition identified and documented | S1 | Identify condition or cease |
| No Art. 30 record of processing | Current, role-distinguished RoPA | S2 | Build RoPA before any audit/launch |
| No DSAR process / rights not operable in time | One-month process with extension logic | S2 | Stand up intake + workflow |
| Breach playbook absent or misses 72h / individual-notice triggers | Tested playbook with clock and thresholds | S1 | Adopt playbook; run a tabletop |
| Transfers out of EEA/UK without a mechanism | Adequacy / SCCs + TRA / BCRs for each transfer | S1 | Implement mechanism; pause transfer |
| No DPIA trigger test or process | Documented trigger + DPIA workflow | S2 | Add DPIA gate to change process |
| Processor contracts missing Art. 28 terms | Compliant DPA with every processor | S2 | Paper the gaps → `privacy/dpa-review` |
| Security measures not risk-proportionate / undocumented | Art. 32 measures mapped to risk and tested | S2 | Baseline + test; evidence it |
| DPO required but not appointed (Art. 37) | DPO appointed and independent, or reasoned non-appointment | S3 (S2 for public body / large-scale special-category) | Appoint or document the assessment |
| No accountability evidence | Policies, records, decisions retrievable | S3 | Centralise the evidence pack |

## Output

Lead with `Decision: APPROVE | APPROVE WITH CONDITIONS | REJECT — <key reason>`. Then the output contract. Add:

- **Scope statement**: applicability (Art. 3), role per activity, representative/DPO status.
- **Area scorecard**: lawful basis · transparency · RoPA · rights · security · breach · transfers · DPIA · governance, each with a status and the top gap.
- **Gap list** mapped to the Checks table, with owner and due date. One JSON finding per gap with `category: "gdpr"`.

## Edge cases & pitfalls

- **Controller vs processor confusion**: applying controller duties to a pure-processor activity (or vice versa) misstates the obligations — fix the role mapping first.
- **UK GDPR drift**: UK rules diverge from the EU in places; treat the UK GDPR + DPA 2018 as a separate instrument, not a copy — mark divergent points `[verify current]`.
- **Consent as a default**: picking consent where a contract or legitimate-interest basis is cleaner creates a fragile, withdrawable foundation.
- **RoPA theatre**: a stale or generic Art. 30 record is worse than none — it signals the programme is paper-only.
- **Transfer gaps hiding in SaaS**: sub-processors move data abroad; a transfer mechanism at the top contract does not cover an uncovered sub-processor.

## References

- Volatile facts: `EU-GDPR-01` (72-hour breach notification). Cite live where a date/threshold is load-bearing; mark `[verify current]`.
- Regulation (EU) 2016/679 (GDPR); UK GDPR + Data Protection Act 2018; EDPB guidelines; relevant supervisory-authority guidance.
