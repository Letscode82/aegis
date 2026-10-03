---
name: regulatory-competition-merger-control
description: >-
  Screens a transaction for merger-control filing and screens conduct for competition-law risk: whether a deal crosses
  notification thresholds (incl. India's CCI deal-value test), where it must be filed and the standstill/gun-jumping
  rule, plus behavioural risks (cartels, information exchange, abuse of dominance, resale-price maintenance). Use to
  decide if a deal is notifiable or to sanity-check conduct. Not for FDI routing → corporate/fdi-fema-assessment; not
  for the multi-country legal grid → research/multi-jurisdiction-survey.
module: regulatory
version: 1.0.0
jurisdictions: [global, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of merger-screen (is the deal notifiable and where), conduct-screen (assess a practice/agreement for competition risk) or filing-plan (map the filings, timing and standstill).
  - name: transaction
    required: false
    description: The deal structure, the parties' turnover/assets (by geography), the target's local nexus, and the deal value — for the threshold tests.
  - name: conduct
    required: false
    description: For conduct mode — the agreement/practice, the parties' market positions/shares, and whether competitors or distributors are involved.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [corporate/fdi-fema-assessment, corporate/ma-due-diligence, research/multi-jurisdiction-survey, corporate/listed-company-disclosure, regulatory/ai-governance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Competition & Merger Control

Takes a transaction or a commercial practice and returns whether it triggers a merger filing (and where, with the standstill rule), or whether a practice carries competition-law risk. The deliverable is a notifiability/risk determination with the filing plan or the conduct fixes, not a general competition-law overview.

## When to use / not use

- Use: deciding whether a deal must be notified to a competition authority and in which jurisdictions; mapping the filing timing and the standstill/gun-jumping obligation; screening an agreement or practice (pricing, distribution, information sharing, a dominant firm's conduct) for competition risk.
- Hand off: foreign-investment route/caps/reporting (a separate regime from merger control) → `corporate/fdi-fema-assessment`; the wider acquisition diligence → `corporate/ma-due-diligence`; building the full country-by-country legal grid → `research/multi-jurisdiction-survey`; the listed-target disclosure timeline → `corporate/listed-company-disclosure`.

## Inputs to collect first

1. **Merger mode:** the deal structure (acquisition, merger, JV, asset deal), the parties' **turnover and assets by geography**, the **target's local nexus**, and the **deal value**.
2. **Conduct mode:** the agreement/practice, whether the parties are **competitors (horizontal)** or at different levels (**vertical**), and their **market shares / dominance**.
3. The relevant jurisdictions and whether any imposes a **suspensory (standstill)** obligation.
4. Timing pressure and any foreign-investment/FDI screening running in parallel.

## Method

1. **Merger — test notifiability against each regime's thresholds.** Apply the turnover/asset thresholds per jurisdiction; in **India**, apply the CCI asset/turnover tests **and** the **deal-value threshold** (deal value > ₹2,000 crore with substantial business operations in India) plus the small-target ("de minimis") exemption where available `[verify current]`. A deal can be notifiable in several jurisdictions at once.
2. **Confirm the local nexus.** Many regimes require a local effect/presence; a filing may not be required where the target has no meaningful local nexus — but don't assume it away.
3. **Respect the standstill / anti-gun-jumping rule.** In suspensory regimes the deal **cannot close** (and the parties cannot integrate or exchange competitively sensitive information) before clearance. Gun-jumping — early integration, pre-closing control, or sharing of sensitive data — is independently penalised `[verify current]`.
4. **Plan the filings and timing.** Identify each required filing, the form/phase, review timelines, and the critical path to closing; coordinate parallel filings and any FDI/foreign-investment screening.
5. **Assess substantive overlap (merger).** Horizontal overlaps and vertical links that could raise a substantive concern (and possible remedies/commitments) — so the risk of a Phase 2 / conditions is understood early.
6. **Conduct — screen for the hard core.** Flag per-se/by-object risks: **cartels** (price-fixing, market/customer allocation, bid-rigging), **competitor information exchange**, and resale-price maintenance; these are the highest-severity, often criminal, and never cured by "it's just commercial".
7. **Conduct — assess dominance and verticals.** Where a party may be dominant, screen for **abuse** (exclusionary rebates, refusal to deal, tying, predatory/excessive pricing); for vertical agreements, screen exclusivity, non-competes, and territorial/online-sales restrictions.
8. **Fix or escalate.** For risky conduct, propose the compliant alternative (clean-team protocols, removing RPM, narrowing exclusivity) or recommend leniency/legal privilege handling where a cartel is suspected.
9. **Score against the Checks table** and set a determination: **NOTIFIABLE (file in X) / NOT NOTIFIABLE** and, for conduct, **LOW / MATERIAL / SERIOUS risk**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Thresholds not tested per jurisdiction | Each regime's turnover/asset/deal-value test run | S1 | Run every relevant threshold `[verify current]` |
| India deal-value test missed | CCI deal-value + local-operations test applied | S1 | Apply the deal-value threshold `[verify current]` |
| Local nexus assumed away | Nexus confirmed before skipping a filing | S2 | Confirm or file |
| Standstill / gun-jumping breached | No pre-clearance closing/integration/info-sharing | S1 | Hold closing; clean-team sensitive data |
| Filing critical path not mapped | Filings + timelines + closing path set | S2 | Build the filing plan |
| Substantive overlap not assessed | Horizontal/vertical concerns + remedy risk flagged | S2 | Assess overlap early |
| Cartel / by-object conduct not flagged | Price-fixing/allocation/bid-rigging screened | S1 | Stop the conduct; consider leniency |
| Competitor info exchange unguarded | Clean-team / need-to-know controls | S1 | Add exchange controls |
| Dominance abuse not screened | Exclusionary conduct tested where dominant | S2 | Screen and fix the practice |
| RPM / hard vertical restraint missed | Resale-price / territorial restraints checked | S2 | Remove or justify the restraint |

## Output

Lead with `Determination: NOTIFIABLE in <jurisdictions> | NOT NOTIFIABLE — and/or — conduct risk: LOW | MATERIAL | SERIOUS — <deal/practice>`. Then the output contract. Add:

- **Merger**: thresholds applied (incl. India deal-value) · where it must be filed · standstill obligation · critical path.
- **Substantive**: horizontal/vertical overlaps and remedy risk.
- **Conduct**: the by-object/dominance/vertical findings with the fix per item.
- One JSON finding per issue with `category: "competition"`.

## Edge cases & pitfalls

- **Multi-jurisdiction filings**: one deal can be notifiable in several countries with different thresholds and timelines — missing one holds the whole closing.
- **Deal-value threshold (India)**: a target with low turnover can still be caught by the ₹2,000-crore deal-value test if it has substantial India operations — turnover alone isn't the whole test.
- **Gun-jumping**: integrating, taking control, or swapping sensitive data before clearance is penalised separately from any substantive concern — stay apart until cleared.
- **"Just commercial" cartels**: price, customer, or bid coordination with competitors is per-se illegal regardless of intent or market share — never soften it.
- **Dominance myopia**: conduct that's fine for a small player (exclusivity, rebates) can be abusive for a dominant one — assess the market position first.

## References

- Volatile facts: `IN-CCI-01` (deal-value threshold, in force Sep 2024). Merger thresholds, de minimis exemptions, and standstill rules are volatile and jurisdiction-specific — cite `[verify current]` on any load-bearing threshold.
- The relevant competition statutes/guidelines (India Competition Act as amended 2023 + CCI regulations; EU Merger Regulation / TFEU Arts 101–102; local regimes); merger-notification forms and leniency programmes.
