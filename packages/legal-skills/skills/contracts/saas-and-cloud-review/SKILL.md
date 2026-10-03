---
name: contracts-saas-and-cloud-review
description: >-
  Reviews a SaaS / cloud subscription or MSA from the customer side: service levels and credits, data protection and
  security, availability and disaster recovery, suspension, price increases and auto-renewal, liability and indemnity,
  IP and usage data, exit and data portability. Use to redline or assess a cloud/SaaS agreement, order form or MSA.
  Not for a generic commercial contract → contracts/contract-review; not for the DPA alone → privacy/dpa-review;
  not for vendor security posture diligence → contracts/vendor-due-diligence.
module: contracts
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: document
    required: true
    description: The SaaS/cloud agreement, MSA, order form, SLA, DPA and any incorporated online terms (AUP, support policy).
  - name: posture
    required: false
    description: Whether we are the customer or the provider (default customer) and how business-critical the service is (sets how hard to push on SLA, exit and liability).
  - name: data_sensitivity
    required: false
    description: What data goes into the service — personal/special-category, regulated, or confidential — which raises the DPA, security and transfer stakes.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [contracts/contract-review, contracts/vendor-due-diligence, privacy/dpa-review, contracts/renewal-termination-advisor, regulatory/security-frameworks, contracts/obligation-extraction]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# SaaS & Cloud Agreement Review

Reviews a cloud/SaaS deal from the customer's seat and returns a redline-ready issues list with positions and fallbacks on the terms that actually bite in a subscription: uptime and credits, data and security, lock-in and exit, price rises, and the liability cap. The deliverable is a prioritised negotiation list with a recommendation, not a clause-by-clause paraphrase.

## When to use / not use

- Use: reviewing or redlining a SaaS subscription, cloud services agreement, MSA + order form, or the SLA/DPA that hangs off them, from the customer side (or provider side if flagged).
- Hand off: a generic commercial contract with no cloud specifics → `contracts/contract-review`; the data-processing agreement in isolation → `privacy/dpa-review`; assessing the provider's security posture/certifications → `contracts/vendor-due-diligence` + `regulatory/security-frameworks`; pulling tracked obligations post-signature → `contracts/obligation-extraction`; renewal/termination mechanics across a portfolio → `contracts/renewal-termination-advisor`.

## Inputs to collect first

1. The full stack of documents: MSA/agreement, order form, SLA, DPA, AUP, support policy, and any URL-incorporated terms.
2. Posture: customer or provider, and how critical/substitutable the service is.
3. Data sensitivity: personal/special-category, regulated, or merely confidential business data.
4. Commercial frame: term, fees, auto-renewal, and whether this is a negotiated MSA or click-through.

## Method

1. **Assemble the real contract.** Cloud terms are layered — the agreement usually incorporates online SLAs, AUPs and support policies the provider can change unilaterally. Flag every "as updated from time to time" incorporation as a live risk.
2. **Service levels & credits.** Check the uptime commitment, how it is measured (and what's excluded — maintenance, "emergency", beyond-provider-control), the credit as the *sole remedy* trap, and whether chronic failure gives a termination right. Credits are usually derisory; the exit right matters more.
3. **Data protection & security.** Confirm a DPA with Art. 28-grade terms, sub-processor control and notice, international-transfer mechanism, security commitments (ideally tied to a certification → `regulatory/security-frameworks`), breach-notice timing, and audit/evidence rights → `privacy/dpa-review`.
4. **Availability, backup & DR.** Backup frequency, RPO/RTO, and whether DR is contractual or best-efforts. "We are not a backup service" clauses shift continuity risk to the customer.
5. **Suspension & throttling.** Scope the provider's right to suspend (non-payment, AUP breach, "risk to the service"); require notice and cure where feasible, and carve suspension back for the customer's critical operations.
6. **Price increases & auto-renewal.** Cap uplift at renewal, require advance notice, and give a real non-renewal window — the single biggest source of surprise cost → `contracts/renewal-termination-advisor`.
7. **IP, usage data & aggregated data.** Confirm the customer owns its content/input and output as agreed; scrutinise provider rights to use "usage data" or train models on customer data; require de-identification and an opt-out for any AI/analytics reuse.
8. **Liability & indemnity.** Check the cap (often 12 months' fees), the carve-outs (data breach, confidentiality, IP indemnity, personal injury), the IP infringement indemnity, and whether the provider excludes all data-loss/consequential loss while holding the customer's data.
9. **Exit & portability.** The decisive clause: data export in a usable format, a defined transition-assistance period, deletion with certification, and no hostage-taking on fees. No exit right = lock-in.
10. **Assess each against the Checks table** and set a decision: **APPROVE / APPROVE WITH CONDITIONS / REJECT (renegotiate)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No usable exit / data-portability right | Export in standard format + transition help + certified deletion | S1 | Add exit clause; this is a dealbreaker for critical services |
| Provider may change incorporated terms unilaterally | Material changes need notice + no material degradation | S2 | Freeze key terms to the signed version |
| DPA missing / weak for personal data | Art. 28 terms + sub-processor control + transfer mechanism | S1 (personal/regulated data) | → `privacy/dpa-review`; do not go live without it |
| SLA credit is sole remedy, no chronic-failure exit | Credits + termination right on sustained breach | S2 | Add exit trigger; treat credits as cosmetic |
| Unlimited/one-sided price increase at renewal | Capped uplift + advance notice + non-renewal window | S2 | Cap and notice → `contracts/renewal-termination-advisor` |
| Provider reuse of customer/usage data (incl. model training) | Customer-owns + opt-out + de-identification | S2 (S1 if personal/confidential) | Restrict reuse; add training opt-out |
| Liability cap excludes data-breach/IP carve-outs | Super-cap or uncapped for data breach, confidentiality, IP indemnity | S2 | Add carve-outs; raise cap for data loss |
| Broad suspension right without notice/cure | Notice + cure + carve-back for critical ops | S3 | Narrow suspension triggers |
| No backup/DR commitment | Contractual RPO/RTO or customer-side backup plan | S3 | Get commitment or plan around it |
| Online AUP/support policy not reviewed | All incorporated terms reviewed as part of the contract | S3 | Pull and review the linked terms |

## Output

Lead with `Decision: APPROVE | APPROVE WITH CONDITIONS | REJECT — <key reason>`. Then the output contract. Add:

- **Document map**: which layered terms were reviewed (MSA, order form, SLA, DPA, AUP, incorporated URLs).
- **Negotiation list**: issue · our ask · fallback · severity, ordered by leverage/impact.
- **Must-haves vs nice-to-haves** split so the business knows the walk-away points.
- One JSON finding per issue with `category: "saas-cloud"`.

## Edge cases & pitfalls

- **Incorporated-by-URL terms**: the real risk often lives in a linked AUP or support policy the provider can edit at will — review them and freeze the material ones.
- **"Credits as sole remedy"**: traps the customer into token compensation for repeated outages; pair with a chronic-failure exit.
- **AI/model-training reuse**: newer SaaS terms grant broad rights to use customer data to improve/"train" the service — default to opt-out, especially for personal/confidential data.
- **Sub-processor sprawl**: the provider's sub-processors may move data abroad or weaken the security story; require a list, notice of changes, and an objection right.
- **Deletion ≠ export**: a deletion-on-exit clause with no export right still strands the customer's data.

## References

- Volatile facts: cite live where a data-protection date/threshold is load-bearing; mark `[verify current]`.
- Customer-side SaaS/cloud contracting norms; GDPR Art. 28 (processor terms); common SLA/credit structures; transition-services / data-portability practice.
