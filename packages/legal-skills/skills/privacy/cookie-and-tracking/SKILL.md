---
name: privacy-cookie-and-tracking
description: >-
  Assesses and fixes consent and disclosure for cookies, pixels, tags and mobile SDKs: ePrivacy consent for non-
  essential storage/access, the strictly-necessary exemption, consent-banner design (no dark patterns), a tracker
  inventory, and the GDPR/DPDPA overlay. Use to review a cookie banner, build a cookie policy, or audit website/app
  trackers. Not for the site's full privacy notice → privacy/privacy-notice-drafter; not for the legitimate-interests
  analysis of other processing → privacy/legitimate-interest-assessment.
module: privacy
version: 1.0.0
jurisdictions: [global, EU, UK, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of audit (review existing banner/trackers), policy (draft a cookie policy) or design (specify a compliant consent flow).
  - name: tracker_inventory
    required: false
    description: List of cookies/pixels/SDKs — name, provider, purpose (essential / functional / analytics / advertising), duration, and whether first- or third-party.
  - name: jurisdictions
    required: false
    description: Markets served — drives the consent model (EU/UK opt-in vs some US opt-out regimes).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [privacy/privacy-notice-drafter, privacy/legitimate-interest-assessment, privacy/us-state-privacy, privacy/gdpr-compliance, regulatory/ai-governance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Cookies, SDKs & Tracking

Gets consent and disclosure right for everything that stores or reads information on a user's device — cookies, pixels, tags, fingerprinting and mobile SDKs — under ePrivacy (consent) with the GDPR/DPDPA overlay. The deliverable is a defensible consent model plus a cookie policy that matches the trackers actually running.

## When to use / not use

- Use: reviewing a cookie banner or CMP; building a cookie/tracking policy; auditing the trackers on a site or app; specifying a compliant consent flow for a new build; reconciling the banner with what actually fires.
- Hand off: the site's overall privacy notice → `privacy/privacy-notice-drafter`; the LI analysis for non-cookie processing → `privacy/legitimate-interest-assessment`; US opt-out-of-sale/sharing and GPC specifics → `privacy/us-state-privacy`.

## Inputs to collect first

1. The **actual** tracker inventory (scan the site/app, don't trust the policy) — name, provider, purpose, first/third-party, duration.
2. Markets served (EU/UK opt-in vs some US opt-out models) and audience (children?).
3. The current banner/CMP behaviour: what fires **before** consent, and what each button does.
4. Whether any tracking feeds advertising, cross-site profiling, or AI model training.

## Method

1. **Classify each tracker** by purpose: strictly necessary, functional/preferences, analytics, advertising/profiling. Only **strictly necessary** (needed to provide a service the user explicitly requested — e.g. session, load-balancing, cart, security) is exempt from consent.
2. **Apply the ePrivacy consent rule**: storing or accessing information on a device for anything **non-essential** requires **prior, specific, informed, freely-given consent** — before the tracker fires. "Analytics" and "advertising" are not strictly necessary; neither is consent replaceable by legitimate interests for device storage/access.
3. **Assess the consent mechanism** (no dark patterns): "Accept all" and "Reject all" must be **equally prominent and equally easy** (reject available at the first layer); no pre-ticked boxes; granular choice by purpose; no cookie walls where that negates "freely given" `[verify current]`; easy withdrawal as simple as giving; re-prompt on material change.
4. **Check pre-consent firing**: nothing non-essential should load before consent — the commonest and most-enforced failure. Verify tags are gated, not just hidden.
5. **GDPR overlay**: once consent is the ePrivacy gate, the resulting processing still needs GDPR compliance — the privacy notice, retention, international transfers (many ad/analytics vendors transfer to the US — check the mechanism), and no special-category inference without an Art. 9 condition.
6. **India / DPDPA overlay**: device identifiers tied to an individual are personal data; consent must meet DPDPA standards (itemised, withdrawable); children's tracking/behavioural monitoring/targeted ads are restricted (s.9) `[verify current]` (IN-DPDP-03).
7. **US overlay** (if in scope): many states use an **opt-out** model for sale/share and targeted advertising, honour **Global Privacy Control**, and require a "Do Not Sell or Share" link — different from EU opt-in `[verify current]`.
8. **Reconcile policy ↔ reality**: the cookie policy/table must list exactly the trackers that run, their purpose and duration; remove orphan entries and add undisclosed ones.
9. **Score** and set a decision: **COMPLIANT / FIX BEFORE RELEASE / STOP (non-essential firing pre-consent)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Non-essential trackers fire before consent | Nothing non-essential loads pre-consent | S1 | Gate all non-essential tags at the CMP |
| "Reject" harder than "Accept" | Equal prominence; reject at first layer | S2 | Redesign banner |
| Pre-ticked / bundled consent | Granular, unticked, per-purpose | S2 | Un-bundle; default off |
| Consent used where exemption misclaimed | Strictly-necessary limited to service-essential | S2 | Reclassify; gate the rest |
| Cookie wall negating free consent | Genuine choice to decline non-essential | S2 | Remove/limit wall `[verify current]` |
| Policy ≠ actual trackers | Cookie table matches what fires | S2 | Rebuild table from a live scan |
| No withdrawal mechanism | Withdraw as easy as consent; persistent control | S2 | Add a standing preferences link |
| International transfer by ad/analytics vendor unaddressed | Transfer mechanism in place + disclosed | S2 | `privacy/cross-border-transfer` |
| Children tracked without protection | No behavioural tracking/targeted ads to children | S1 (India/known-child) | Disable for children |
| US opt-out / GPC not honoured | "Do Not Sell/Share" + GPC respected | S2 (US) | `privacy/us-state-privacy` |

## Output

Lead with `Decision: COMPLIANT | FIX BEFORE RELEASE | STOP — <headline failure or "clean">`. Then the output contract. Add:

- **Tracker table**: name · provider · purpose · essential? · consent required? · duration · first/third-party · status.
- **Banner findings**: pre-consent firing, button parity, granularity, withdrawal.
- Policy mode: the cookie policy as a titled section with the tracker table embedded.
- One JSON finding per issue with `category: "cookies"`.

## Edge cases & pitfalls

- **"Analytics is essential"**: it is not — convenience to you is not necessity to the user; gate it behind consent.
- **Server-side / GTM ≠ exempt**: moving tags server-side does not remove the consent requirement for device access.
- **Fingerprinting and SDKs count**: ePrivacy covers *any* access to device information, not just cookies — mobile SDKs and fingerprinting are in scope.
- **Opt-in vs opt-out by market**: don't apply one global model — EU/UK is opt-in; several US states are opt-out with GPC.
- **Silence isn't consent**: continuing to browse is not valid consent in the EU/UK.

## References

- Volatile facts: IN-DPDP-03 (DPDPA timing); mark `[verify current]` on any date/threshold or evolving regulator position (cookie walls, consent-or-pay).
- ePrivacy Directive 2002/58/EC Art. 5(3) (and national implementations, e.g. PECR in the UK); GDPR Arts. 6, 7, 9, 44-49; EDPB cookie/consent guidance `[verify current]`; DPDP Act 2023 s.9; US state privacy laws and Global Privacy Control `[verify current]`.
