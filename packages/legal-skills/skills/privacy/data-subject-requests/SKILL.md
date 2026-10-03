---
name: privacy-data-subject-requests
description: >-
  Handles a data-subject / data-principal request end to end — access, erasure, rectification, restriction,
  portability, objection — across GDPR/UK GDPR and India DPDP: identity verification, scope, locating data, the
  exemptions and refusal grounds, redaction of third-party data, the legal-hold conflict check, and the on-time
  response. Use to triage or fulfil a specific rights request, or to design the DSAR workflow. Not for a whole GDPR
  programme → privacy/gdpr-compliance; not for a live breach → privacy/breach-response.
module: privacy
version: 1.0.0
jurisdictions: [EU, UK, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of fulfil (process a specific request), triage (assess validity, type and clock) or workflow-design (build/audit the DSAR process).
  - name: request
    required: false
    description: The request text, the requester, the right(s) invoked, and the date received (starts the statutory clock).
  - name: regime
    required: false
    description: Which law governs — GDPR, UK GDPR, India DPDP — and the organisation's role (controller/fiduciary vs processor).
  - name: context
    required: false
    description: Whether the requester is a customer, employee or other; any live dispute, investigation or legal hold touching their data; and the systems likely holding it.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/dpdpa-compliance, privacy/breach-response, disputes/litigation-hold, privacy/privacy-notice-drafter, privacy/dpa-review]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Data Principal / Subject Request Handling

Takes a rights request and drives it to a defensible, on-time outcome: verify who's asking, fix the scope and clock, find the data, apply the right exemptions, redact third-party data, clear the legal-hold conflict, and respond. The deliverable is a disposition and a response plan with the clock and exemptions stated, not a summary of the right.

## When to use / not use

- Use: triaging or fulfilling a specific access/erasure/rectification/restriction/portability/objection request; building or auditing the DSAR intake-to-response workflow.
- Hand off: the overall privacy programme → `privacy/gdpr-compliance` (EU/UK) or `privacy/dpdpa-compliance` (India); a breach that the request may relate to → `privacy/breach-response`; preserving data under a litigation hold → `disputes/litigation-hold`; whether a processor must assist → `privacy/dpa-review`.

## Inputs to collect first

1. The request text, the right(s) invoked, the requester, and the date received (the clock starts here).
2. The governing regime and the organisation's role (controller/fiduciary vs processor — a processor forwards, it does not decide).
3. Identity-verification status and whether the requester acts for themselves or via an agent.
4. Any live dispute, investigation or legal hold touching the requester's data.
5. The systems and record types likely to hold the data (email, CRM, HR, backups, logs).

## Method

1. **Classify the right and confirm the regime.** Access, erasure, rectification, restriction, portability, objection, and rights re automated decisions each have different scope, exemptions and limits — do not treat them as one "DSAR". Portability, for instance, is narrower than access (only data provided by the subject, processed by consent/contract, in machine-readable form).
2. **Verify identity proportionately.** Enough to be sure, not a barrier — avoid demanding excessive ID. For an agent, confirm authority. Verification can pause but not reset the clock unreasonably.
3. **Fix the clock.** GDPR/UK GDPR: respond **within one month**, extendable by **two further months** for complex/numerous requests with notice and reasons. India DPDP: respond within the period the Rules prescribe (grievance response ≤90 days under `IN-DPDP-06`) `[verify current]`. State the due date.
4. **Scope the request.** A controller may ask the requester to specify where processing is large, but cannot use scoping to stall. Define date ranges, systems and record types.
5. **Locate the data** across production systems and, where in scope, backups/archives — but apply proportionality (disproportionate-effort limits where the law allows).
6. **Run the legal-hold / litigation conflict check first for erasure.** Erasure cannot spoliate data under a legal hold or needed for a legal claim — this is the critical cross-module gate. If a hold applies, refuse/limit erasure on that ground and record why → `disputes/litigation-hold`.
7. **Apply exemptions and third-party protection.** Legal privilege, others' rights and freedoms, ongoing investigations, trade secrets, and (for erasure) the grounds that defeat it (legal obligation, legal claims, freedom of expression). **Redact third-party personal data** before disclosing in an access response.
8. **Decide and respond.** Fulfil, partially fulfil (with the redactions/exemptions explained), or refuse (with the ground and the right to complain to the regulator). Deliver access data securely; confirm erasure/rectification actioned, including to recipients/processors where required.
9. **For workflow-design**, assess intake routing, the clock tracker, identity-verification steps, the system-search map, the hold-conflict gate, redaction tooling, and the audit trail.
10. **Score against the Checks table** and set a decision: **FULFIL / PARTIAL / REFUSE**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Erasure actioned despite a legal hold / claim | Hold-conflict check before any deletion | S1 | Block erasure on that ground; record reason → `disputes/litigation-hold` |
| Clock missed or not tracked | Due date set + tracked from receipt | S1 | Respond now; log the breach; consider the regulator angle |
| Third-party personal data disclosed unredacted | Redact others' data before releasing | S1 | Re-do the disclosure with redactions |
| Over-demanding identity verification used to stall | Proportionate verification only | S2 | Accept reasonable proof; resume the clock |
| Wrong right applied (e.g. portability treated as access) | Right classified and scoped correctly | S2 | Re-classify; scope to the right's limits |
| Exemption claimed without a basis | Each withholding tied to a named exemption | S2 | State the ground or disclose |
| Refusal without reasons / complaint route | Refusal explains ground + right to complain | S2 | Add reasons + regulator signpost |
| Backups/processors not addressed where required | Downstream recipients/processors actioned | S3 | Propagate the action; confirm |
| No audit trail of the handling | Each step logged with timestamps and decisions | S3 | Record the file |

## Output

Lead with `Disposition: FULFIL | PARTIAL | REFUSE — <right> — <key reason>`. Then the output contract. Add:

- **Request summary**: right, requester, date received, due date, regime.
- **Handling plan**: verification · scope · systems searched · hold-conflict result · exemptions/redactions applied.
- **Response**: what is disclosed/actioned/withheld and the stated grounds; the regulator-complaint signpost on any refusal.
- One JSON finding per issue with `category: "dsar"`.

## Edge cases & pitfalls

- **Erasure before the hold check**: deleting under a "right to be forgotten" when a litigation hold applies is spoliation — the hold check comes first, always.
- **Employee access requests in disputes**: often tactical; still must be answered, but privilege and others' rights frequently narrow what's disclosable.
- **Backups**: not always in scope, but a blanket "we can't search backups" is not a lawful refusal where the law expects it.
- **Fees**: generally no fee; a reasonable fee or refusal only for manifestly unfounded/excessive or repeat requests — document that finding.
- **India vs EU divergence**: DPDP rights, timelines and the consent-manager route differ from GDPR — treat them separately and mark `[verify current]`.

## References

- Volatile facts: `IN-DPDP-06` (DPDP timelines), `IN-DPDP-03` (fiduciary obligations commencement). Cite live where a timeline is load-bearing; mark `[verify current]`.
- GDPR Arts. 12–22; UK GDPR + DPA 2018 (incl. exemptions in Sch. 2–4); India DPDP Act 2023 + DPDP Rules 2025.
