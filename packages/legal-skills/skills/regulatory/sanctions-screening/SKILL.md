---
name: regulatory-sanctions-screening
description: >-
  Screens a counterparty, transaction or payment against sanctions and watchlists and adjudicates the alert:
  OFAC (incl. the 50% Rule), EU/UK consolidated lists, UN, and India (UAPA/MHA, RBI) regimes; name-matching,
  ownership/control, nexus and secondary-sanctions exposure. Use to clear or escalate a sanctions hit, design a
  screening control, or assess sanctions risk before onboarding or paying. Not for export licensing of goods/tech →
  regulatory/export-controls; not for bribery controls → regulatory/anti-bribery.
module: regulatory
version: 1.0.0
jurisdictions: [global, US, EU, UK, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of adjudicate (clear/escalate a specific screening alert), screen (assess a named party/transaction) or control-design (build or audit a screening programme).
  - name: subject
    required: false
    description: The party/transaction details — legal name, aliases, DOB/registration, country, ownership chain, and the counterparties/banks/goods involved.
  - name: hit_detail
    required: false
    description: For adjudication — the list(s) matched, match score, and the fields that matched (name, DOB, address).
  - name: nexus
    required: false
    description: Which regimes could bind — US-person nexus, USD clearing, EU/UK establishment, Indian entity — and whether secondary sanctions are in play.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/export-controls, regulatory/anti-bribery, contracts/vendor-due-diligence, regulatory/applicability-mapper, disputes/regulatory-investigation]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Sanctions Screening & Alert Adjudication

Takes a potential sanctions match and reaches a defensible disposition — **true match / possible match / false positive** — with the ownership, nexus and secondary-sanctions analysis an examiner would expect, or designs the control that produces those dispositions at scale. The deliverable is a disposition with reasons and evidence, not a list of regimes.

## When to use / not use

- Use: adjudicating a screening alert on a customer, vendor, payment or shipment; assessing a named party before onboarding or payment; designing or auditing a sanctions-screening programme (list coverage, fuzzy-match thresholds, escalation).
- Hand off: whether goods/technology/software need an export licence → `regulatory/export-controls`; bribery/corruption controls → `regulatory/anti-bribery`; broader counterparty diligence → `contracts/vendor-due-diligence`; a regulator inquiry arising from a breach → `disputes/regulatory-investigation`.

## Inputs to collect first

1. The exact subject identifiers: legal name, aliases/transliterations, date/place of birth or registration, country, address.
2. The ownership and control chain (who owns/controls the party, and in what percentages).
3. The nexus facts: any US person involved, USD-clearing, EU/UK establishment or nationals, Indian entity — these decide which regimes apply.
4. For adjudication: which list matched, the match score, and exactly which fields matched.
5. The transaction context: counterparties, correspondent banks, goods, destination, end-use.

## Method

1. **Fix the applicable regimes by nexus**, not by assumption. US (OFAC) binds US persons and often USD transactions and non-US persons who "cause" a violation or face secondary sanctions; EU measures bind EU nationals/entities and conduct in the EU; UK (OFSI) binds UK persons worldwide; India applies UAPA/MHA designations and RBI controls. State which bind and why.
2. **Resolve the match quality.** Compare the full identifier set (name + DOB/registration + country + address), account for transliteration and alias variants, and classify the alert as **false positive**, **possible match (needs more info)**, or **true match**. Do not clear on name alone.
3. **Run the ownership/control test.** OFAC's **50% Rule** blocks entities owned 50%+ (individually or in aggregate) by blocked persons even if not themselves listed; EU/UK apply a control-based test. Trace the chain — a clean party owned by a blocked person is still blocked.
4. **Assess the specific prohibition.** Asset freeze (no dealing with funds/economic resources), sectoral/sectoral-list limits, trade embargo, or prohibition on specific services. Map the proposed activity to the exact restriction — not every listing means a total ban.
5. **Check secondary-sanctions and de-risking exposure** even where no primary regime binds (e.g. a non-US party facing OFAC secondary designation for dealing with an SDN). Flag where proceeding is lawful but strategically dangerous.
6. **Decide and route.** True match → freeze/decline and consider a **mandatory report / licence** path (OFSI/OFAC/MHA) `[verify current]`; possible match → escalate for enhanced review and hold; false positive → clear with a documented rationale.
7. **For control-design mode**, assess list coverage and refresh cadence, fuzzy-match thresholds, re-screening on list changes, PEP/adverse-media overlay, alert workflow and audit trail, and sanctions clauses in contracts.
8. **Score against the Checks table** and set the disposition decision: **CLEAR / ESCALATE / BLOCK**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Potential true match to an asset-freeze designation | Confirmed non-match, or freeze + report/licence | S1 | Freeze, decline, escalate to MLRO/counsel |
| Ownership 50%+ by a blocked person ignored | Full ownership chain traced and tested | S1 | Apply 50% Rule; treat as blocked |
| Clearing a hit on name match alone | Multi-field confirmation before clearing | S2 | Re-screen with DOB/registration/address |
| Nexus/regime mis-scoped | Regimes fixed by the actual nexus facts | S2 | Re-run the nexus analysis |
| Secondary-sanctions exposure unassessed | Explicit secondary-sanctions call | S2 | Flag strategic risk even if lawful |
| Prohibition type not matched to the activity | Activity mapped to the exact restriction | S3 | Confirm freeze vs sectoral vs embargo |
| No/weak list coverage or refresh cadence (control-design) | Consolidated lists + re-screen on changes | S2 | Add missing lists + automated refresh |
| No audit trail for the disposition | Every alert disposition logged with reasons | S2 | Record rationale + evidence |

## Output

Lead with `Disposition: CLEAR | ESCALATE | BLOCK — <subject> vs <list> — <key reason>`. Then the output contract. Add:

- **Regime applicability**: which regimes bind and why (nexus).
- **Match analysis**: fields compared, match quality, ownership/control result.
- **Required actions**: freeze / report / licence / enhanced review, with the reporting body and any deadline `[verify current]`.
- One JSON finding per issue with `category: "sanctions"`.

## Edge cases & pitfalls

- **Name-only clearing**: the single most common error and the one examiners punish — always confirm against more than the name.
- **The 50% Rule and aggregation**: ownership is aggregated across blocked persons and flows down the chain; a 30% + 25% split by two SDNs still blocks.
- **USD nexus**: a non-US party can pull in OFAC jurisdiction merely by clearing USD through a US correspondent bank.
- **Delisting lag**: a party may be freshly delisted or freshly added; a static list snapshot is dangerous — re-screen against the live list and mark `[verify current]`.
- **Over-blocking**: freezing on a weak possible match without escalation can itself cause legal and commercial harm; escalate, don't guess.

## References

- Volatile facts: cite live where a listing status or reporting window is load-bearing; mark `[verify current]`.
- OFAC (SDN list, 50% Rule guidance, OFAC regulations); EU consolidated list + Council Regulations; UK OFSI consolidated list + sanctions regulations; UN Security Council lists; India UAPA designations / MHA, RBI FEMA controls.
