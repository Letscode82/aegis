---
name: regulatory-operational-resilience
description: >-
  Assesses an organisation's operational-resilience and ICT/third-party-risk posture against EU DORA, NIS2 and the
  UK/sectoral resilience regimes: important business services and impact tolerances, ICT third-party risk and
  concentration, incident classification and reporting clocks, testing (incl. threat-led), and governance. Use to
  gap-assess resilience obligations, scope a DORA/NIS2 programme, or review an ICT outsourcing. Not for the generic
  security-certification mapping → regulatory/security-frameworks; not for a live incident → privacy/breach-response.
module: regulatory
version: 1.0.0
jurisdictions: [EU, UK, global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of gap-assess (posture vs the applicable regime), scope (stand up a DORA/NIS2 programme) or outsourcing-review (assess an ICT third-party/cloud arrangement).
  - name: entity
    required: false
    description: Sector and status — financial entity under DORA, essential/important entity under NIS2, UK regulated firm — and size, which set which regime and intensity bind.
  - name: services
    required: false
    description: The critical/important business services, their supporting ICT, and the key third-party/cloud providers (incl. any designated critical ICT provider).
  - name: current_state
    required: false
    description: Existing resilience framework, impact tolerances, incident process, testing programme, and third-party register.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/security-frameworks, privacy/breach-response, regulatory/financial-services-india, contracts/vendor-due-diligence, contracts/saas-and-cloud-review, regulatory/product-cyber-obligations]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Operational Resilience (DORA / NIS2)

Turns "are we resilient and compliant?" into a mapped posture against the binding regime: the important services and their impact tolerances, the ICT third-party and concentration risk, the incident-classification and reporting clocks, the testing cadence, and the governance that owns it — with the gaps ranked. The deliverable is a resilience gap assessment or programme scope, not a précis of the regulations.

## When to use / not use

- Use: gap-assessing operational-resilience / ICT-risk obligations; scoping a DORA or NIS2 programme; reviewing an ICT outsourcing or cloud concentration; preparing for a resilience-focused supervisory review.
- Hand off: the ISO/SOC2/NIST certification mapping and general cyber controls → `regulatory/security-frameworks`; responding to a live incident → `privacy/breach-response`; Indian financial-sector resilience (RBI/SEBI/IRDAI) → `regulatory/financial-services-india`; assessing the provider itself → `contracts/vendor-due-diligence`; the cloud contract terms → `contracts/saas-and-cloud-review`.

## Inputs to collect first

1. Sector and regulatory status — this decides whether DORA (financial entities), NIS2 (essential/important entities) and/or a UK/sectoral regime binds, and at what intensity.
2. The important/critical business services and the ICT that supports each.
3. The key third-party ICT providers, including any cloud concentration and any designated critical ICT third-party provider.
4. Current state: resilience framework, impact tolerances, incident process + clocks, testing programme, third-party register and contract terms.

## Method

1. **Fix the applicable regime(s) and intensity.** **DORA** (Reg. (EU) 2022/2554) applies to a broad set of EU financial entities, applying since 17 Jan 2025 (`EU-DORA-01`) `[verify current]`. **NIS2** (Dir. (EU) 2022/2555) applies to essential/important entities across many sectors, via national transposition that varies (`EU-NIS2-01`) `[verify current]`. UK firms follow the FCA/PRA/BoE operational-resilience rules and the sectoral regime. State which bind.
2. **Identify important business services and set impact tolerances.** Define each important service and the maximum tolerable disruption (time/number of customers/financial loss) — the anchor the whole programme maps to. A service with no impact tolerance is unmanaged.
3. **Map the supporting chain and single points of failure.** For each important service, the people/process/technology/third-party dependencies, and where one failure takes the service down.
4. **Assess ICT third-party risk and concentration.** A register of ICT providers, contractual resilience/audit/exit terms (DORA has specific contractual requirements), sub-outsourcing visibility, and **concentration risk** (too much riding on one cloud/provider). Flag any designated critical ICT third-party provider → `contracts/saas-and-cloud-review`.
5. **Incident classification + reporting clocks.** Classify ICT-related incidents and map the reporting duties:
   - **DORA major ICT incident** — initial notification within hours of classification, intermediate and final reports follow (`EU-DORA-02`) `[verify current]`.
   - **NIS2** — 24-hour early warning, 72-hour notification, one-month final report (`EU-NIS2-01`) `[verify current]`.
   State the clock per applicable regime; a single generic "report promptly" process is non-compliant.
6. **Testing programme.** Regular resilience testing, and for larger DORA entities **threat-led penetration testing (TLPT)**; scenario/severe-but-plausible testing against the impact tolerances. Evidence the results feed remediation.
7. **Business continuity & ICT continuity.** Backups, recovery objectives tied to the impact tolerances, and tested failover — resilience is proven by exercise, not by a plan on a shelf.
8. **Governance.** Board/management-body accountability, a resilience framework owner, and reporting — DORA and NIS2 both put management-body responsibility front and centre.
9. **For outsourcing-review mode**, test the specific arrangement against the regime's third-party requirements (resilience terms, audit/access, exit/stressed-exit, sub-outsourcing, concentration).
10. **Score against the Checks table** and set a decision: **COMPLIANT / COMPLIANT WITH GAPS / NOT COMPLIANT**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Incident reporting clocks (DORA/NIS2) unmet or unmapped | Classification + per-regime clocks + playbook | S1 | Build the reporting runbook per regime |
| Important services without impact tolerances | Each important service has a set tolerance | S1 | Define services + tolerances first |
| ICT third-party concentration unmanaged | Concentration assessed + mitigated; exit viable | S2 | Map concentration; plan a stressed exit |
| ICT contracts missing required resilience/exit terms | DORA-grade terms (audit, exit, sub-outsourcing) | S2 | Re-paper the contracts → `contracts/saas-and-cloud-review` |
| No resilience testing / no TLPT where required | Scenario testing + TLPT for in-scope entities | S2 | Stand up the testing programme |
| Continuity plan untested against tolerances | Recovery objectives tied to tolerances + tested | S2 | Set objectives; run an exercise |
| Management body not accountable | Named board/exec ownership + reporting | S2 | Assign governance + reporting |
| Sub-outsourcing chain invisible | Chain mapped; onward dependencies known | S3 | Require disclosure of sub-outsourcing |

## Output

Lead with `Status: COMPLIANT | COMPLIANT WITH GAPS | NOT COMPLIANT — <regime/entity> — <key reason>`. Then the output contract. Add:

- **Regime applicability**: which regime(s) bind, intensity, and why.
- **Important-services map**: service · impact tolerance · key dependencies · single points of failure.
- **ICT third-party view**: providers · concentration · contract/exit gaps.
- **Incident clocks**: regime · classification · reporting timeline · status.
- **Gap list** ranked with owner. One JSON finding per gap with `category: "operational-resilience"`.

## Edge cases & pitfalls

- **Impact tolerance is the anchor**: without it, "resilience" is unmeasurable and every downstream control floats — set tolerances before controls.
- **Concentration risk hides in "best practice"**: everyone on one hyperscaler is efficient and fragile; the regime expects an assessed, exit-capable position.
- **NIS2 transposition varies**: the directive is implemented by national law with differences — rely on the transposing statute, not the directive alone, and mark `[verify current]`.
- **Reporting-clock divergence**: DORA and NIS2 (and sectoral regimes) have different windows; a single generic incident process misses at least one.
- **Testing theatre**: a BC plan never exercised against a severe-but-plausible scenario is not evidence of resilience.

## References

- Volatile facts: `EU-DORA-01`, `EU-DORA-02`, `EU-NIS2-01`. Cite live where a clock or applicability date is load-bearing; mark `[verify current]`.
- Regulation (EU) 2022/2554 (DORA) + RTS/ITS; Directive (EU) 2022/2555 (NIS2) + national transposition; UK FCA/PRA/BoE operational-resilience policy; sectoral resilience rules.
