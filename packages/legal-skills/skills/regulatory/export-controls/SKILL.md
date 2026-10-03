---
name: regulatory-export-controls
description: >-
  Classifies an item, software or technology for export-control purposes and screens a proposed export/transfer:
  classification (US EAR ECCN / EU dual-use), end-use and end-user red flags, deemed exports, encryption controls,
  licence/exception analysis, and re-export/foreign-direct-product reach. Use to decide whether an export needs a
  licence, classify a product, or screen a transaction. Not for sanctions/watchlist hits → regulatory/sanctions-screening;
  not for anti-bribery → regulatory/anti-bribery.
module: regulatory
version: 1.0.0
jurisdictions: [global, US, EU, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of classify (determine the item's control classification) or screen (assess a specific export/transfer for licence need and red flags).
  - name: item
    required: false
    description: The item/software/technology — function, performance parameters, encryption, and whether it is commercial, dual-use or military.
  - name: transaction
    required: false
    description: Origin, destination, end-user, end-use, parties in the chain, and whether a foreign national will access the technology (deemed export).
  - name: nexus
    required: false
    description: Which regime(s) bind — US EAR/ITAR reach (incl. re-export / foreign-direct-product), EU dual-use, India SCOMET — and any US-origin content/technology.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/sanctions-screening, regulatory/anti-bribery, contracts/vendor-due-diligence, regulatory/applicability-mapper, regulatory/product-cyber-obligations]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Export Controls Classification

Takes an item or a proposed export and answers the controlling question: **is a licence required, and if so under what, or does an exception apply?** — with the classification, end-use/end-user screen, and jurisdictional reach that make the answer defensible. The deliverable is a classification + licence decision with red-flag findings, not a description of the control lists.

## When to use / not use

- Use: classifying a product, software or technology for export; deciding whether a specific export, re-export, or in-country transfer needs a licence; screening an end-user/end-use; assessing deemed-export (foreign-national access) risk.
- Hand off: a sanctions/watchlist match on a party → `regulatory/sanctions-screening`; bribery/corruption controls → `regulatory/anti-bribery`; broader counterparty diligence → `contracts/vendor-due-diligence`; product cybersecurity obligations → `regulatory/product-cyber-obligations`.

## Inputs to collect first

1. The item: function, key performance parameters, encryption strength/type, and whether it is commercial, dual-use, or military/defence.
2. The transaction: origin, destination country, end-user, stated end-use, and every party in the chain.
3. Whether a foreign national will access controlled technology/source code (deemed export).
4. The nexus: US-origin content or technology (pulling in EAR/ITAR, re-export and foreign-direct-product rules), EU dual-use, India SCOMET.

## Method

1. **Classify first — jurisdiction then category.** Determine which control regime the item falls under before anything else: **US ITAR** (defence articles on the USML) vs **US EAR** (commercial/dual-use, assigned an **ECCN** on the CCL, or `EAR99` if uncontrolled); **EU dual-use** (Reg. 2021/821 Annex I); **India SCOMET**. The classification drives everything downstream.
2. **Pin the ECCN / list entry** by the item's actual parameters, not its marketing name. Encryption items have their own controls (EAR Cat. 5 Part 2) with specific parameters and notification/exception regimes — screen these explicitly.
3. **Map destination controls.** Cross the classification against the destination: the Commerce Country Chart (reasons for control vs country) for the EAR, or the destination's status under the EU/India regime. This yields "licence required / not required / exception available" for that country.
4. **Screen end-use and end-user red flags** — prohibited end-uses (military/WMD/nuclear/missile per EAR Part 744), restricted-party lists (Entity List, Denied Persons, Unverified), and the classic diversion red flags (reluctance about end-use, mismatched capability, routing through a third country, cash for high-tech). A red flag is an affirmative duty to inquire, not a permission to ignore.
5. **Assess deemed exports.** Releasing controlled technology or source code to a foreign national *in-country* is an export to their country of nationality — common and easily missed (visiting engineers, offshore dev, cloud access). Classify and licence it like any export.
6. **Assess re-export and foreign-direct-product reach.** US jurisdiction follows US-origin items, US content above de minimis, and — for some targets — products that are the *direct product* of US technology/tools, even when made and shipped entirely outside the US. Non-US transactions can still be caught.
7. **Licence or exception.** If a licence is required, identify the right licence type; if an exception/exemption applies (e.g. EAR licence exceptions, EU general authorisations), confirm *every* condition is met and documented — exceptions are conditional, not automatic.
8. **For classify mode**, output the classification + the rationale and the parameters relied on, so a reviewer can re-derive it.
9. **Score against the Checks table** and set a decision: **NO LICENCE REQUIRED / LICENCE (or EXCEPTION) REQUIRED / DO NOT EXPORT (prohibited / unresolved)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Export to a prohibited end-use/end-user (WMD, restricted party) | Screened clean against end-use + party lists | S1 | Do not export; escalate; consider reporting |
| Licence required but not obtained | Licence/exception confirmed before shipping | S1 | Hold the export; apply for the licence |
| Item misclassified (marketing name vs parameters) | ECCN/list entry derived from real parameters | S1 | Re-classify on the parameters |
| Deemed export (foreign-national access) missed | Foreign-national access classified + licensed | S1 | Restrict access or licence it |
| Red flag ignored (diversion indicators) | Duty-to-inquire discharged + documented | S2 | Investigate; resolve before proceeding |
| Re-export / foreign-direct-product reach unassessed | US-origin/content/FDP reach checked | S2 | Assess US nexus even for non-US deals |
| Encryption controls not screened | Cat. 5 Pt 2 parameters + notification checked | S2 | Screen encryption specifically |
| Licence exception claimed without meeting all conditions | Every condition met and documented | S2 | Verify conditions or get a licence |

## Output

Lead with `Decision: NO LICENCE REQUIRED | LICENCE/EXCEPTION REQUIRED | DO NOT EXPORT — <item/route> — <key reason>`. Then the output contract. Add:

- **Classification**: regime + ECCN/list entry (or EAR99/SCOMET status) + the parameters relied on.
- **Transaction screen**: destination control result · end-use/end-user findings · deemed-export result · US re-export/FDP reach.
- **Licence/exception**: what is required and its conditions, or why none is.
- One JSON finding per red flag/issue with `category: "export-controls"`.

## Edge cases & pitfalls

- **EAR99 ≠ no rules**: even uncontrolled items can't go to an embargoed destination or a restricted party — classification doesn't end the screen.
- **Deemed exports in the cloud / offshore dev**: giving an overseas contractor access to controlled source is an export; "it never left our server" is not a defence.
- **Foreign-direct-product rule**: a product built abroad from US tools/technology can still need US authorisation for certain destinations — non-US ≠ out of reach.
- **Encryption is its own world**: standard commercial encryption has specific EAR Cat. 5 Pt 2 treatment (self-classification, notification, exceptions) — don't fold it into a generic ECCN.
- **Red flag = duty to inquire**: spotting a diversion indicator and shipping anyway converts negligence into knowing violation.

## References

- Volatile facts: cite live where a control-list entry, country status or restricted-party listing is load-bearing; mark `[verify current]`.
- US EAR (CCL/ECCNs, Country Chart, Part 744 end-use/end-user, de minimis + FDP rules) and ITAR/USML; EU Dual-Use Regulation (EU) 2021/821; India SCOMET list; BIS "Know Your Customer" red-flag guidance.
