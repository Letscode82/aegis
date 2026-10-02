---
name: privacy-breach-response
description: >-
  Decides who must be notified of a personal data breach or cyber incident, by when and with what, across
  DPDPA/DPDP Rules, CERT-In, RBI/SEBI/IRDAI, GDPR/UK GDPR, US state laws, SEC 8-K, NIS2 and DORA; runs the clock
  table, evidence preservation and privilege set-up. Use when an incident, ransomware, misdirected email, lost
  device or vendor breach notice is reported, or to test a breach SOP. Not for designing security controls →
  regulatory/security-frameworks; regulator investigations after notice → disputes/regulatory-investigation.
module: privacy
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: incident_facts
    required: true
    description: What happened, when it started, when and how we became aware, systems, status (contained or ongoing).
  - name: data_affected
    required: false
    description: Data categories, record counts and residence of affected individuals; whether encrypted (and key status).
  - name: entities
    required: false
    description: Affected group entities, their regulators, listing status, and whether we are controller/fiduciary or processor.
  - name: contracts
    required: false
    description: Customer/vendor contracts with notification clauses; cyber insurance policy.
  - name: matter_id
    required: false
    description: AEGIS matter to anchor the privileged workstream.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/sanctions-screening, privacy/dpdpa-compliance, privacy/gdpr-compliance, privacy/us-state-privacy, privacy/dpa-review, disputes/litigation-hold, disputes/regulatory-investigation, corporate/listed-company-disclosure, regulatory/operational-resilience, regulatory/financial-services-india, regulatory/security-frameworks, matters/stakeholder-comms]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Breach Response

Turns a raw incident report into a notification decision for every regime that could apply, a running clock table, and the immediate legal steps (privilege, preservation, insurer, contracts). Clocks start at different triggers and some are measured in hours, so the first output must be fast and conservative: start every clock that might be running, then close the ones that are ruled out.

**Privileged & Confidential - prepared at the direction of counsel.** Mark every output this way.

## When to use / not use

- Use at first report of any suspected incident involving personal data or critical systems, on a vendor's breach notice, and for tabletop exercises against the SOP.
- Hand off: preservation notices → `disputes/litigation-hold`; regulator follow-up → `disputes/regulatory-investigation`; listed-company disclosure in India (SEBI LODR) → `corporate/listed-company-disclosure`; EU financial-entity ICT incident reporting detail → `regulatory/operational-resilience`; customer/employee communications plan → `matters/stakeholder-comms`.

## Inputs to collect first (first 30 minutes)

1. **Awareness time** - when anyone in the organisation (or our processor) had a reasonable degree of certainty an incident occurred. Record the timestamp with time zone; it anchors most clocks.
2. **Nature**: confidentiality (exfiltration/exposure), integrity (alteration), availability (ransomware/outage).
3. **Data and people**: categories, approximate count, residence (India / EU / UK / which US states), children, sensitive data, credentials.
4. **Entities and regulators**: which legal entity controls the data; sector licences (bank, NBFC, PA, broker, insurer); listed securities (India, US).
5. **Our role**: controller/fiduciary (we notify) or processor (we notify our customer, fast).
6. **Mitigation state**: contained? encryption with uncompromised keys? data recovered?

Missing facts never stop the clock. Notify on what is known and supplement.

## Method

1. **Open the privileged workstream**: counsel retains forensic firm (engagement through counsel, scope tied to legal advice); separate business-as-usual remediation from the legal investigation; label communications; limit distribution. Privilege over forensic reports is fragile - in the US, courts have ordered production where the report served business purposes or was shared widely `[general principle — verify]`; in India, s.126-129 Evidence Act protections (now ss.132-134 Bharatiya Sakshya Adhiniyam 2023) protect lawyer communications, not facts, and in-house counsel protection is narrower `[general principle — verify]`. Never put conclusions on liability in the technical report.
2. **Preserve evidence**: images, logs (CERT-In requires 180-day logs retained in India; DPDP Rule 6 one-year logs from IN-DPDP-03), email, tickets; suspend auto-deletion; issue litigation hold → `disputes/litigation-hold`. Do not wipe and rebuild before imaging.
3. **Notify insurer** per policy notice clause (often "as soon as practicable"; panel vendors may be mandatory for cover). Check ransom payment conditions and sanctions screening before any payment (OFAC/OFSI/EU lists) → `regulatory/sanctions-screening`.
4. **Run the decision tree** for each regime (below). For each: applies? trigger met? deadline? recipient? content? Start the clock if in doubt.
5. **Build the clock table** (output). Sort by deadline. Assign owner per row.
6. **Draft notifications** - regulator forms are prescriptive; prepare holding notice first, then detailed report.
7. **Contracts**: customer and partner notification clauses (often 24-72h); processor duties; card-scheme rules (PCI DSS) if card data.
8. **Communications**: affected individuals in plain language; one approved holding statement; no admissions of liability or speculation on cause.
9. **Close-out**: root cause, regulator follow-ups, remediation evidence, lessons learned, SOP update.

## Notification decision tree

| Regime | Applies when | Trigger / threshold | Deadline | To whom |
|---|---|---|---|---|
| **India DPDPA** (s.8(6), Rule 7) | Fiduciary processing digital personal data of principals in India | **Any** personal data breach - no harm threshold | Without delay to each affected principal and to Board; detailed report to Board within 72h of awareness (extendable by Board) | Data Protection Board; affected principals. In force from IN-DPDP-03 `[verify current]`; before then, SPDI Rules regime + CERT-In |
| **CERT-In** (Directions 28 Apr 2022, IT Act s.70B(6)) | Service providers, intermediaries, data centres, body corporates and government organisations | Listed incident types (incl. data breach, data leak, ransomware, unauthorised access, attacks on servers/apps/cloud) | **6 hours** from noticing or being notified (IN-CERTIN-01) | incident@cert-in.org.in / portal |
| **RBI** | Banks, NBFCs, payment system operators, other REs | Cyber incidents per IT governance / cyber security directions | Hours-based reporting to RBI under the RE's applicable cyber/IT direction - never assume; confirm the window for the RE category (proposed IN-SECT-01 `[verify current]`) | RBI (CSITE / DoS) |
| **SEBI** (CSCRF, 20 Aug 2024) | SEBI-regulated entities | Cyber incidents/attacks | Tiered by entity category (MIIs fastest) `[verify current]` | SEBI portal + CERT-In / CSIRT-Fin |
| **IRDAI** (Information & Cyber Security Guidelines 2023) | Insurers, intermediaries | Cyber incidents | Short-hour reporting to IRDAI alongside CERT-In `[verify current]` | IRDAI |
| **SEBI LODR** (listed in India) | Listed entity | Material event incl. cyber incident details where material | 24h for material events (Reg. 30 framework) `[verify current]` | Stock exchanges → `corporate/listed-company-disclosure` |
| **EU GDPR / UK GDPR** Art. 33 | Controller in EU/UK, or targeting EU/UK data subjects | Breach unless "unlikely to result in a risk" | Without undue delay, where feasible within **72h** of awareness (EU-GDPR-01); reasons for delay if late; phased info allowed | Lead supervisory authority / ICO |
| GDPR Art. 34 | As above | "Likely to result in a high risk" | Without undue delay | Data subjects (exceptions: encryption, subsequent measures, disproportionate effort → public communication) |
| Processor (GDPR Art. 33(2); DPDPA via contract) | We process for a customer | Becoming aware | Without undue delay; contract hours | Controller / fiduciary |
| **NIS2** (Art. 23) | Essential/important entities in EU member states | Significant incident | 24h early warning; 72h notification; 1 month final (EU-NIS2-01) | National CSIRT/competent authority |
| **DORA** (Art. 19; RTS) | EU financial entities | Major ICT-related incident | Initial ≤4h from classification and ≤24h from awareness; intermediate 72h; final 1 month (proposed EU-DORA-02; EU-DORA-01) | Competent authority |
| **US state breach laws** (all 50 states + DC etc.) | Residents' "personal information" as defined (name + SSN, licence, financial account with code, often health, biometrics, credentials) | Unauthorised acquisition (some states access) unless encrypted with key safe; many have risk-of-harm exceptions | "Most expedient time possible"; fixed outer limits in many states (e.g. 30 days in CO, FL, WA; 45/60 days elsewhere) `[verify current]`; AG notice above per-state thresholds | Residents; state AG/regulators; CRAs above volume thresholds → `privacy/us-state-privacy` |
| **HIPAA** | Covered entities / business associates; PHI | Unsecured PHI breach | ≤60 days to individuals; HHS (≥500: contemporaneous; <500: annual); media if >500 in a state | HHS OCR |
| **SEC Form 8-K Item 1.05** | US domestic registrants (foreign private issuers furnish material incidents on Form 6-K) | Material cybersecurity incident | 4 business days after materiality determination, made without unreasonable delay (US-SEC-01) | SEC |
| **NYDFS Part 500** | NY-licensed financial entities | Cybersecurity event meeting §500.17 | 72h; extortion payment notice 24h `[verify current]` | NYDFS |
| Contracts / card schemes | Per contract | Per clause | Often 24-72h | Customers, partners, acquirer |

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Awareness time fixed | Documented timestamp with basis | S1 if absent (clocks unknowable) | Use earliest plausible time |
| CERT-In 6h | Report filed or ruled out with reason | S1 | File holding report; supplement |
| DPDPA dual track | Board + principals planned; 72h report drafted | S1 (₹200 cr band) | Track IN-DPDP-03; until then note voluntary |
| GDPR risk analysis | Documented "unlikely to result in risk" reasoning if not notifying (Art. 33(5) register) | S2 | Notify if in doubt |
| Processor notice to us | Received within contract time | S3 | Reserve rights; demand info |
| Privilege | Counsel-led engagement, separate reports | S2 | Re-paper engagement now |
| Evidence preservation | Images, logs, hold issued | S2 | Immediate hold |
| Ransom | Sanctions screen, insurer consent, law-enforcement liaison, board approval | S1 | Escalate to GC/CEO |
| Admissions | No liability or cause speculation in external comms | S2 | Legal review of every statement |
| Individual notice content | Nature, consequences, mitigation, steps to take, contact (Rule 7(1); Art. 34(2)) | S2 | Template |
| Board/audit committee | Informed per governance policy | S3 | Brief → `corporate/board-pack` |

## Output

Lead with `Notify now: <regimes with deadlines under 24h>` then the Bottom line. Add between Findings and Actions:

**Clock table** (always, even if most rows read "not applicable"):

| Regime | Applies? | Trigger time | Deadline (date/time, TZ) | Recipient | Owner | Status |
|---|---|---|---|---|---|---|

Also return **evidence log** (item, custodian, preserved how, when) and **draft holding notices** for each regulator due within 72h. JSON: each regime is a finding (`category: "notification"`); each deadline is an action with `blocking: true` and an ISO `due`.

## Edge cases & pitfalls

- **Clock triggers differ**: CERT-In "noticing"; GDPR "becoming aware"; DORA "classification" capped at 24h from detection; SEC "materiality determination". Never compute all from one time.
- **Encryption** removes US state and GDPR Art. 34 duties only if keys were not compromised; DPDPA has no encryption safe harbour for intimation.
- **Availability-only incidents** (ransomware with no exfiltration) are still personal data breaches under GDPR and DPDPA, and reportable to CERT-In.
- **Group structure**: each entity is notified separately; one regulator filing does not cover another entity.
- **Employees as victims** (HR data): DPDPA and GDPR apply equally.
- **Over-notification**: regulators rarely penalise early, accurate notices; they penalise late ones. When unsure, notify with "investigation ongoing".
- **Law-enforcement delay** requests: honoured by some US state laws and GDPR practice, not by CERT-In or DPDPA text - document any delay request.

## References

- Volatile facts: IN-CERTIN-01, IN-DPDP-01, IN-DPDP-03, EU-GDPR-01, EU-NIS2-01, EU-DORA-01, US-SEC-01; proposed IN-SECT-01, EU-DORA-02.
- DPDPA s.8(6); DPDP Rules 2025 Rule 7; CERT-In Directions No. 20(3)/2022-CERT-In (28 Apr 2022); GDPR Arts. 33-34; UK GDPR Arts. 33-34; Directive (EU) 2022/2555 Art. 23; Regulation (EU) 2022/2554 Art. 19 and Delegated Regulation (EU) 2025/301; 17 CFR 229.106 and Form 8-K Item 1.05; 45 CFR 164.400-414; 23 NYCRR 500.17.
