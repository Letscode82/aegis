---
name: regulatory-security-frameworks
description: >-
  Maps an organisation's security posture to the frameworks customers and regulators ask for — ISO/IEC 27001,
  SOC 2, NIST CSF, CIS Controls — and to binding cyber regimes (EU DORA, NIS2, Cyber Resilience Act; India CERT-In;
  US SEC cyber disclosure). Use to prepare for a client infosec / security-clearance review, scope a certification,
  or gap-assess controls and incident-reporting duties. Not for data-protection/GDPR specifically →
  privacy/gdpr-compliance; not for a live breach response → privacy/breach-response.
module: regulatory
version: 1.0.0
jurisdictions: [global, EU, IN, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of client-review (answer a customer's security questionnaire / clearance), certification-scope (scope ISO 27001 / SOC 2) or gap-assess (controls + regulatory duties).
  - name: target_framework
    required: false
    description: Which standard(s) are in play — ISO/IEC 27001:2022, SOC 2 (which Trust Services Criteria), NIST CSF 2.0, CIS Controls — and whether a binding regime applies (DORA, NIS2, CRA, CERT-In, SEC).
  - name: scope
    required: false
    description: Systems, services, data types, and the entity/boundary the review covers (the ISMS / SOC 2 system boundary).
  - name: current_state
    required: false
    description: Existing policies, controls, certifications, pentest/audit results, and any incident-reporting runbook.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/breach-response, regulatory/operational-resilience, regulatory/product-cyber-obligations, contracts/vendor-due-diligence, platform/skill-security-audit]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Security Framework Mapping

Translates "pass the customer's security review" or "get us to ISO 27001 / SOC 2" into a scoped control map, an evidence list, and a ranked gap set — plus the binding cyber-reporting duties that overlay the voluntary frameworks. The deliverable is a readiness view with specific gaps and evidence, not a description of the standards.

## When to use / not use

- Use: preparing for a client's infosec questionnaire, security-clearance or vendor-risk review; scoping an ISO/IEC 27001 or SOC 2 effort; gap-assessing controls and the incident-reporting obligations that bind by sector/geography.
- Hand off: data-protection-specific obligations → `privacy/gdpr-compliance`; a live incident → `privacy/breach-response`; financial-sector operational resilience in depth → `regulatory/operational-resilience`; product/device cybersecurity duties (CRA) → `regulatory/product-cyber-obligations`; assessing a *vendor's* posture → `contracts/vendor-due-diligence`; reviewing this platform's own controls → `platform/skill-security-audit`.

## Inputs to collect first

1. The trigger: which customer/regulator is asking, and against which framework or questionnaire.
2. The scope/boundary: systems, services, data types, locations, and the legal entity under review.
3. Current state: policies, controls in place, prior certifications/audits, pentest findings, and the incident runbook.
4. The binding-regime facts: sector (financial, essential/important entity, device manufacturer, SEC registrant) and geography — these decide which mandatory reporting duties overlay the framework.

## Method

1. **Separate voluntary frameworks from binding regimes.** ISO 27001 / SOC 2 / NIST CSF / CIS are standards you *adopt*; DORA, NIS2, CRA, CERT-In and SEC cyber rules are laws you *must* meet. Map both; never let a certification imply legal compliance.
2. **Fix the scope/boundary** precisely — the ISMS scope (ISO) or the system boundary (SOC 2) determines what is in and what evidence is needed. An over-broad scope is the usual cause of a stalled certification.
3. **Pick the control baseline and map existing controls to it.** ISO/IEC 27001:2022 Annex A (93 controls, four themes); SOC 2 Trust Services Criteria (Security always; Availability / Confidentiality / Processing Integrity / Privacy as selected); NIST CSF 2.0 functions (Govern, Identify, Protect, Detect, Respond, Recover); CIS Controls v8 for a concrete technical floor.
4. **Assess each control: implemented / partial / missing, and is there evidence?** Certification turns on *evidence* (policies, logs, tickets, test results), not intentions — list the artefact each control needs.
5. **Overlay the binding incident-reporting clocks** where a regime applies:
   - **EU DORA** — major ICT incident: initial notice within hours of classification, intermediate and final reports follow (cite `EU-DORA-01`, `EU-DORA-02`) `[verify current]`.
   - **EU NIS2** — essential/important entities: 24-hour early warning, 72-hour notification, one-month final report (cite `EU-NIS2-01`) `[verify current]`.
   - **EU CRA** — product manufacturers: actively-exploited-vulnerability and incident reporting duties (cite `EU-CRA-01`) `[verify current]`.
   - **India CERT-In** — reportable incident within **6 hours** of noticing (cite `IN-CERTIN-01`) `[verify current]`.
   - **US SEC** — material cyber incident on Form 8-K Item 1.05 within four business days of the materiality determination (cite `US-SEC-01`) `[verify current]`.
6. **Check the governance spine**: risk assessment + treatment plan, asset/data inventory, access control, logging/monitoring, vulnerability management, vendor/supply-chain risk, BCP/DR, and an exercised incident-response plan. These recur across every framework.
7. **For client-review mode**, answer the questionnaire against real evidence, flag any answer that would be "no/partial", and propose the remediation or compensating control rather than overclaiming.
8. **Score gaps** against the Checks table and set a decision: **READY / READY WITH CONDITIONS / NOT READY**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Binding reporting duty (DORA/NIS2/CERT-In/SEC) unmet or unmapped | Clock + playbook per applicable regime | S1 | Build the reporting runbook; it is law, not optional |
| Scope/boundary undefined | Precise ISMS / system boundary agreed | S2 | Define scope before mapping controls |
| Control claimed but no evidence | Every claimed control backed by an artefact | S2 | Produce/collect evidence; don't overclaim |
| No risk assessment + treatment plan | Documented, current risk register + RTP | S2 | Stand up the risk process |
| Access control / logging gaps | Least-privilege + monitored, retained logs | S2 | Remediate; add compensating control |
| No exercised incident-response plan | IR plan tested within the year | S2 | Write + tabletop the plan |
| Vendor/supply-chain risk unmanaged | Third-party risk process + contract security terms | S3 | → `contracts/vendor-due-diligence` |
| BCP/DR untested | Recovery objectives + a tested plan | S3 | Define RTO/RPO; run a test |
| Certification implied as legal compliance | Framework and regime tracked separately | S3 | Correct the claim |

## Output

Lead with `Readiness: READY | READY WITH CONDITIONS | NOT READY — <framework/review> — <key reason>`. Then the output contract. Add:

- **Scope statement**: boundary, framework(s), and any binding regime in play.
- **Control map**: by framework domain — implemented / partial / missing + the evidence artefact.
- **Binding-duty table**: regime · trigger · clock · status.
- **Gap list** ranked with owner, remediation, and whether a compensating control is acceptable interim. One JSON finding per gap with `category: "security-framework"`.

## Edge cases & pitfalls

- **SOC 2 Type I vs Type II**: Type I is design at a point in time; Type II tests operation over a period — a customer asking for "SOC 2" usually means Type II, which needs sustained evidence.
- **Certification ≠ compliance**: an ISO 27001 certificate does not discharge DORA/NIS2/CERT-In duties, and vice versa.
- **Scope creep**: the fastest way to fail a certification is an unbounded scope; narrow it, then expand.
- **Reporting-clock drift**: cyber-incident windows differ sharply (6 h CERT-In vs 72 h NIS2 vs four business days SEC) — a single generic "report promptly" runbook is non-compliant.
- **Stale pentest as evidence**: a year-old test against a changed system is weak evidence; tie evidence to the current boundary.

## References

- Volatile facts: `EU-DORA-01`, `EU-DORA-02`, `EU-NIS2-01`, `EU-CRA-01`, `IN-CERTIN-01`, `US-SEC-01`. Cite live where a clock or status is load-bearing; mark `[verify current]`.
- ISO/IEC 27001:2022 + Annex A; AICPA SOC 2 Trust Services Criteria; NIST CSF 2.0; CIS Controls v8; Regulation (EU) 2022/2554 (DORA); Directive (EU) 2022/2555 (NIS2); Regulation (EU) 2024/2847 (CRA); CERT-In Directions (28 Apr 2022); SEC Item 1.05.
