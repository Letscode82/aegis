---
name: privacy-regional-privacy-pack
description: >-
  Applies the emerging-market privacy regimes as jurisdiction modules on one engine — Brazil LGPD, Singapore PDPA,
  Vietnam PDPD/PDPL, UAE PDPL and Saudi PDPL — mapping each to legal basis, data-subject rights, cross-border transfer,
  breach notification, local-representative/registration and penalty specifics, and flagging where they diverge from a
  GDPR baseline. Use when a product touches BR/SG/VN/AE/SA and you need the per-country obligations. Not for GDPR
  itself → privacy/gdpr-compliance; not for India DPDP → privacy/dpdpa-compliance; not for US states →
  privacy/us-state-privacy.
module: privacy
version: 1.0.0
jurisdictions: [BR, SG, VN, AE, SA]
risk_tier: review-required
inputs:
  - name: jurisdictions
    required: true
    description: Which of BR / SG / VN / AE / SA are in scope (one or several), and whether the entity is established there or only targets/monitors residents.
  - name: processing
    required: false
    description: The processing activity — data categories (incl. sensitive), roles (controller/processor), purposes, and whether data leaves the country.
  - name: posture
    required: false
    description: What's already in place (notices, consent, DPO/representative, registration) so the output is a gap list, not a restatement of law.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/gdpr-compliance, privacy/dpdpa-compliance, privacy/us-state-privacy, privacy/cross-border-transfer, privacy/data-subject-requests, regulatory/applicability-mapper]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Regional Privacy Pack

Takes a processing activity touching Brazil, Singapore, Vietnam, the UAE or Saudi Arabia and returns the per-country privacy obligations against a GDPR baseline: legal basis, rights, transfer rules, breach timelines, local-presence/registration, and penalties — with the divergences flagged. The deliverable is a jurisdiction-by-jurisdiction gap list, not a single blurred "regional" answer.

## When to use / not use

- Use: scoping privacy obligations for a product/processing activity in BR, SG, VN, AE or SA; comparing one of these regimes to a GDPR programme you already run; building a per-country compliance checklist (basis, rights, transfer, breach, representative, registration).
- Hand off: the EU GDPR assessment itself → `privacy/gdpr-compliance`; India DPDP Act/Rules → `privacy/dpdpa-compliance`; US state laws → `privacy/us-state-privacy`; the mechanics of a specific transfer → `privacy/cross-border-transfer`; handling an individual rights request → `privacy/data-subject-requests`; the "which laws even apply" triage across many regimes → `regulatory/applicability-mapper`.

## Inputs to collect first

1. **Which jurisdictions** (BR/SG/VN/AE/SA) and whether the entity is **established** there or only **targets/monitors** residents — extraterritorial reach differs per regime.
2. The **processing**: data categories (flag sensitive/children), controller vs processor role, purposes, and whether data **leaves the country**.
3. The **current posture** (notice, consent/basis, DPO or local representative, any registration) so the output is a gap list.
4. Whether a **free-zone** regime applies (UAE: DIFC/ADGM have their own data-protection laws distinct from the federal PDPL).

## Method

1. **Treat each jurisdiction as a module on one engine.** The common engine is the GDPR-shaped lifecycle (basis → notice → rights → transfer → breach → accountability); each country is a module that overrides specific cells. Run the engine per country, don't average them.
2. **Fix the legal basis model per regime.** LGPD has ten bases incl. legitimate interest; Singapore PDPA runs on consent + statutory exceptions + the legitimate-interests/business-improvement bases; Vietnam leans heavily on **consent** with tight carve-outs; UAE and Saudi PDPL enumerate bases with consent prominent. Don't assume a GDPR basis transplants.
3. **Map data-subject rights per country.** Access/correction/deletion/portability/objection exist unevenly — confirm which rights, the response window, and any fee/ID-verification rule for each regime rather than offering a generic rights menu.
4. **Nail cross-border transfer — the biggest divergence.** Each regime has its own mechanism (adequacy/ whitelists, standard contractual clauses, consent, or regulator approval) and some impose **localisation or prior-approval** steps (notably Vietnam and Saudi for certain data). Resolve transfer per country → `privacy/cross-border-transfer`.
5. **Set breach-notification timelines per regime** — they are not the GDPR 72 hours by default; record the authority-notification and data-subject-notification trigger and window for each country `[verify current]`.
6. **Check local-presence and registration duties.** DPO/representative appointment, local registration/filing, and record-keeping obligations differ (e.g. representative requirements, Saudi registration regime) — list them per country.
7. **Record penalties and enforcement posture** so risk is proportionate — fine ceilings and regulator activity vary widely across these five.
8. **Flag sensitive/children/biometric overrides** and any sector rule that layers on top.
9. **Score against the Checks table** and output one compliance block per in-scope jurisdiction with divergences from the GDPR baseline called out, plus the prioritised gaps.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Regimes blurred into one "regional" answer | Each jurisdiction assessed as its own module | S2 | Split per country |
| Legal basis assumed to transplant from GDPR | Basis confirmed against each regime's model | S1 | Re-derive basis per country |
| Rights menu generic, not per-regime | Each country's rights + window confirmed | S2 | Map rights per regime |
| Transfer mechanism not resolved per country | Per-regime mechanism / localisation checked | S1 | Resolve transfer per country `[verify current]` |
| Breach timeline assumed 72h | Per-regime authority + subject windows set | S2 | Record each timeline `[verify current]` |
| Local representative / registration missed | DPO/rep + registration duties listed | S2 | Add the local-presence duties |
| Free-zone vs federal (UAE) confused | DIFC/ADGM vs federal PDPL identified | S2 | Pick the right UAE regime |
| Penalties / sensitive-data overrides ignored | Fine ceilings + sensitive rules noted | S3 | Add penalty + sensitive overrides |

## Output

Lead with `Regional privacy: <jurisdictions> — <n> gaps, top: <the highest-risk one>`. Then the output contract. Add:

- **Per jurisdiction**: basis · rights · transfer · breach · local presence/registration · penalties, each with the divergence from the GDPR baseline.
- **Gaps**: the prioritised per-country actions.
- **Cross-border**: where localisation or prior approval blocks a flow.
- One JSON finding per gap with `category: "regional-privacy"` and a `jurisdiction` field.

## Edge cases & pitfalls

- **Assuming GDPR covers it**: a mature GDPR programme does not satisfy Vietnam's consent-localisation or Saudi/UAE specifics — run each module.
- **UAE federal vs free zone**: DIFC and ADGM have their own laws; applying the federal PDPL to a DIFC entity (or vice versa) is a category error.
- **Consent over-reliance**: treating consent as the universal basis breaks where a regime restricts withdrawal handling or requires a different basis for employee/children's data.
- **Transfer by habit**: reusing EU SCCs without checking each country's accepted mechanism (or localisation) can make the transfer unlawful locally.
- **Stale timelines**: breach windows and registration regimes in these jurisdictions are actively changing — mark them `[verify current]`.

## References

- Volatile facts: none of these regimes has a registered ID yet — cite `[verify current]` on every timeline, transfer mechanism and registration duty.
- The governing instruments (Brazil LGPD; Singapore PDPA; Vietnam PDPD 13/2023 and the PDPL; UAE Federal Decree-Law 45/2021 + DIFC/ADGM laws; Saudi PDPL and its regulations) and each regulator's current guidance.
