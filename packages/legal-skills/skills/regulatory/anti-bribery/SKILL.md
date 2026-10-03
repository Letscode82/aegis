---
name: regulatory-anti-bribery
description: >-
  Designs or audits an anti-bribery & corruption (ABC) programme and assesses specific risks — gifts & hospitality,
  facilitation payments, third-party intermediaries, M&A successor liability — against the UK Bribery Act (incl. the
  s.7 "failure to prevent" defence), US FCAP, and India's Prevention of Corruption Act. Use to build/review an ABC
  programme, clear a gift/hospitality or third-party risk, or scope third-party due diligence. Not for sanctions →
  regulatory/sanctions-screening; not for a live internal investigation → employment/workplace-investigation.
module: regulatory
version: 1.0.0
jurisdictions: [global, UK, US, IN]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of programme (design/audit an ABC programme), risk-clear (assess a specific gift/hospitality, payment or third-party risk) or dd-scope (scope third-party / M&A anti-bribery due diligence).
  - name: footprint
    required: false
    description: Where the organisation operates, sectors, use of agents/distributors/consultants, and any government-touching business (sets exposure).
  - name: nexus
    required: false
    description: Which regimes bind — UK (any business carrying on business in the UK), US (issuer / domestic concern / territorial), India — and whether public officials are involved.
  - name: scenario
    required: false
    description: For risk-clear — the specific gift, hospitality, sponsorship, payment, or third-party relationship under review.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/sanctions-screening, contracts/vendor-due-diligence, regulatory/whistleblower-programme, employment/workplace-investigation, disputes/regulatory-investigation, corporate/ma-due-diligence]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Anti-Bribery & Corruption

Builds or stress-tests an ABC programme, or clears a specific bribery risk, against the regimes that actually prosecute — and makes the "adequate / reasonable procedures" defence real rather than a binder on a shelf. The deliverable is a decision (proceed / mitigate / refuse) or a ranked programme gap list, with the controlling regime and the defence in view.

## When to use / not use

- Use: designing or auditing an ABC programme; clearing a gift, hospitality, sponsorship, charitable donation, facilitation payment or third-party intermediary; scoping anti-bribery due diligence on an agent, distributor or acquisition target.
- Hand off: sanctions/watchlist screening → `regulatory/sanctions-screening`; broader vendor diligence → `contracts/vendor-due-diligence`; the speak-up channel the programme feeds → `regulatory/whistleblower-programme`; investigating a live allegation → `employment/workplace-investigation` or `disputes/regulatory-investigation`; acquisition-target diligence in depth → `corporate/ma-due-diligence`.

## Inputs to collect first

1. Footprint: countries, sectors, and the degree of government-touching business (licences, permits, public contracts, customs).
2. Third-party exposure: agents, distributors, consultants, lobbyists, customs brokers — the channel most enforcement runs through.
3. Nexus: UK (carries on business in the UK), US (issuer/domestic concern/territorial), India — which decides the controlling law.
4. For a specific risk: the exact gift/hospitality/payment/relationship, its value, recipient, timing, and whether a public official is involved.
5. Current controls: policy, risk assessment, third-party DD, gifts register, training, audit rights.

## Method

1. **Fix the controlling regimes by nexus.** **UK Bribery Act 2010** — bribing, being bribed, bribing a foreign public official (s.6), and the corporate **s.7 "failure to prevent bribery"** offence with the **"adequate procedures" defence**; extraterritorial for any organisation carrying on business in the UK. **US FCPA** — anti-bribery (foreign officials) + books-and-records/internal-controls provisions; broad jurisdiction over issuers, domestic concerns and territorial conduct. **India** — Prevention of Corruption Act 1988 (as amended 2018): both giving and taking, with a commercial-organisation offence and a compliance defence. State which bind and why.
2. **Note the key divergences.** The UK Act has **no facilitation-payment exception**; the FCPA has a narrow one but books-and-records rules often catch it anyway — treat facilitation payments as prohibited by default.
3. **For programme mode, test the six "adequate procedures" themes** (UK MOJ guidance, mirrored in US/India expectations): proportionate procedures, top-level commitment, risk assessment, due diligence, communication/training, and monitoring/review. Score each.
4. **Risk-assess the footprint** — government interaction, high-risk geographies, third-party channels, sector norms — and make the programme proportionate to it (not one-size-fits-all).
5. **Third-party controls are the core.** Risk-based DD on intermediaries, anti-bribery contract clauses (representations, audit rights, termination), red-flag screening, and payment controls. Most liability comes through third parties paying on the organisation's behalf.
6. **Gifts, hospitality, sponsorship, donations.** A reasonable, proportionate, transparent, recorded test — not a fixed monetary line; heightened scrutiny where a public official or a pending decision is involved. Register and pre-approval thresholds.
7. **Books-and-records & internal controls.** Accurate accounts with no off-book funds or mischaracterised payments — the FCPA accounting provisions catch concealment even absent a proven bribe.
8. **M&A successor liability.** Acquirers inherit the target's FCPA/Bribery Act exposure; require pre-close anti-bribery DD and post-close integration/remediation → `corporate/ma-due-diligence`.
9. **For risk-clear mode**, apply the tests above to the specific scenario and reach **PROCEED / PROCEED WITH CONDITIONS / REFUSE**, recording the rationale.
10. **Score against the Checks table** and set the decision.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Payment/benefit to a public official to secure an advantage | Clearly legitimate, proportionate, recorded — or refuse | S1 | Refuse; escalate to compliance/counsel |
| Facilitation payment treated as acceptable | Prohibited by default (no UK exception) | S1 | Refuse; find a lawful route; report demands |
| Third-party intermediary with no risk-based DD | DD proportionate to risk + ABC contract clauses | S1 | DD before engaging/paying; add clauses |
| No "adequate/reasonable procedures" evidence (programme) | Six themes implemented and evidenced | S2 | Build the missing theme(s); it is the defence |
| Gifts/hospitality without register or pre-approval | Reasonable + transparent + recorded + thresholds | S2 | Stand up register + approval gate |
| Books-and-records inaccuracy / off-book funds | Accurate accounts; no mischaracterised payments | S1 | Correct; investigate; self-report call |
| No ABC risk assessment | Current, footprint-specific risk assessment | S2 | Run the risk assessment first |
| M&A target exposure not assessed pre-close | Anti-bribery DD + remediation plan | S2 | → `corporate/ma-due-diligence` |
| No training / top-level commitment | Role-based training + visible tone from the top | S3 | Add training + leadership messaging |

## Output

Lead with `Decision: PROCEED | PROCEED WITH CONDITIONS | REFUSE — <scenario/programme> — <key reason>` (for programme mode: `APPROVE | APPROVE WITH CONDITIONS | REJECT`). Then the output contract. Add:

- **Regime applicability**: which laws bind and why (nexus), and the key divergences (facilitation payments, defences).
- **Six-theme scorecard** (programme) or **scenario analysis** (risk-clear): the test, the finding, the condition.
- **Gap/condition list** with owner and due date. One JSON finding per issue with `category: "anti-bribery"`.

## Edge cases & pitfalls

- **Facilitation payments**: a "small grease payment" is still a bribe under the UK Act and usually a books-and-records problem under the FCPA — do not wave them through.
- **Third-party blindness**: "we didn't pay it, our agent did" is exactly the liability the statutes target; the intermediary's conduct is the organisation's risk.
- **Charitable donations / sponsorships as conduits**: scrutinise donations linked to a pending decision or an official's pet cause.
- **Hospitality thresholds as safe harbours**: a fixed £/$ line is not a defence; reasonableness, transparency and timing matter more than amount.
- **Successor liability**: closing an acquisition without anti-bribery DD imports the target's exposure onto the buyer.

## References

- Volatile facts: cite live where an enforcement threshold is load-bearing; mark `[verify current]`.
- UK Bribery Act 2010 (ss.1, 2, 6, 7) + MOJ "adequate procedures" guidance; US FCPA (anti-bribery + accounting provisions) + DOJ/SEC Resource Guide; India Prevention of Corruption Act 1988 (as amended 2018).
