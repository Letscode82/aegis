---
name: contracts-sustainability-clauses
description: >-
  Adds proportionate climate, human-rights and supply-chain clauses to a commercial contract: supplier code
  compliance, modern-slavery/forced-labour and human-rights-due-diligence (CSDDD/import-ban) obligations, ESG data and
  audit/flow-down rights, emissions/environmental commitments, and the remedy ladder (cure, suspension, termination)
  — scoped to real risk and leverage, not greenwashing boilerplate. Use to draft or review ESG contract terms. Not for
  the corporate ESG report → regulatory/esg-reporting; not for a full contract review → contracts/contract-review.
module: contracts
version: 1.0.0
jurisdictions: [global, EU]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of draft (produce the clauses), review (assess existing ESG clauses for teeth/proportionality) or scope (decide which obligations this relationship actually needs).
  - name: relationship
    required: false
    description: The contract type and the counterparty's role in the value chain (supplier, distributor, manufacturer), the sector/geography risk, and the client's own regulatory exposure (CSDDD/CSRD/import bans).
  - name: priorities
    required: false
    description: The ESG commitments that matter most (human rights/forced labour, emissions, supply-chain transparency) and the client's policies/code to flow down.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/esg-reporting, contracts/contract-review, contracts/obligation-extraction, regulatory/operational-resilience, contracts/saas-and-cloud-review]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Sustainability & ESG Clauses

Takes a commercial relationship and returns ESG clauses with real teeth and real proportion: the human-rights/supply-chain/climate obligations the relationship actually needs, flow-down and audit rights, and a remedy ladder — matched to risk and leverage, not greenwashing boilerplate that can't be enforced or that over-reaches a small supplier. The deliverable is drafted/reviewed ESG terms with the enforceability and proportionality traps flagged.

## When to use / not use

- Use: adding climate/human-rights/supply-chain clauses to a supply, manufacturing, distribution, or services contract; reviewing existing ESG clauses for teeth and proportionality; scoping which obligations a given relationship needs (and which are overkill).
- Hand off: preparing the company's own ESG/sustainability **report/disclosure** (BRSR/CSRD/ISSB) → `regulatory/esg-reporting`; the full commercial risk review of the contract → `contracts/contract-review`; extracting the ongoing ESG obligations to track → `contracts/obligation-extraction`; third-party/supply-chain operational-resilience obligations → `regulatory/operational-resilience`.

## Inputs to collect first

1. The **contract type** and the counterparty's **role in the value chain** (direct supplier, sub-tier, distributor).
2. The **sector/geography risk** (high-risk goods/regions for forced labour, environmental harm).
3. The **client's own regulatory exposure** — CSDDD due-diligence duties, CSRD/ISSB reporting, import bans on forced-labour goods — that must flow down.
4. The **policies/supplier code** to incorporate and the **leverage** over this counterparty.

## Method

1. **Scope to real risk and the client's duties — not everything.** Pick the obligations the relationship actually needs given the counterparty's role, sector and geography, and what the client's own law (CSDDD human-rights/environmental due diligence, forced-labour import bans, CSRD value-chain reporting) requires it to flow down `[verify current]`. Don't bolt a full ESG annex onto a low-risk, low-value supply.
2. **Incorporate the supplier code and standards.** Flow down the client's supplier code of conduct and relevant standards (ILO core labour standards, applicable environmental standards) as binding obligations, not aspirations.
3. **Human rights / modern slavery / forced labour.** Require compliance, prohibit forced/child labour across the chain, and obtain the representations, sub-tier flow-down, and the information rights needed for the client's own due-diligence and import-ban screening.
4. **Supply-chain transparency and data.** The ESG data the counterparty must provide (emissions/Scope 3 data, provenance, certifications), in what form and cadence — so the client can meet its reporting duties → `regulatory/esg-reporting`.
5. **Climate/environmental commitments — make them measurable.** Tie any emissions/environmental commitment to a defined metric, baseline and date; a vague "will endeavour to be sustainable" is unenforceable greenwashing. Avoid representations the client itself can't substantiate (greenwashing liability runs both ways).
6. **Audit and verification rights.** Right to audit/inspect (directly or via third party), to require corrective-action plans, and to get evidence — the enforcement backbone; obligations with no verification are decorative.
7. **Build a proportionate remedy ladder.** Notify → corrective-action plan with a deadline → suspension → termination for persistent/serious breach, with termination reserved for serious or uncured issues. A hair-trigger termination right on any ESG slip is neither usable nor fair to a supplier you depend on.
8. **Keep it proportionate and workable.** Match the burden to the counterparty's size and risk; an SME supplier handed a mega-corp ESG annex either refuses or signs-and-ignores — neither helps.
9. **Score against the Checks table** and set a verdict: **FIT & ENFORCEABLE / FIXES NEEDED / GREENWASH/OVER-REACH (redraft)**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Not scoped to risk / client's legal duties | Obligations matched to role, risk, and flow-down duties | S2 | Re-scope to what's needed `[verify current]` |
| Human-rights/forced-labour flow-down missing | Compliance + sub-tier flow-down + info rights | S1 | Add the HR/forced-labour terms |
| ESG data obligations absent | Required data, form and cadence specified | S2 | Add the data clause → esg-reporting |
| Commitments vague / greenwashing | Metric + baseline + date; substantiable | S1 | Make commitments measurable |
| No audit/verification right | Audit + corrective-action + evidence rights | S1 | Add the verification backbone |
| No proportionate remedy ladder | Cure → suspend → terminate for serious/uncured | S2 | Build the remedy ladder |
| Hair-trigger termination on any slip | Termination reserved for serious/uncured breach | S2 | Calibrate the remedy |
| Disproportionate burden on a small supplier | Burden scaled to size/risk | S3 | Right-size the obligations |

## Output

Lead with `Verdict: FIT & ENFORCEABLE | FIXES NEEDED | GREENWASH/OVER-REACH — <relationship> — <key issue>`. Then the output contract. Add:

- **Scope**: the obligations this relationship needs and the client duties they serve.
- **Core clauses**: supplier code · human rights/forced labour · ESG data · climate (measurable).
- **Enforcement**: audit/verification rights + the remedy ladder.
- **Proportionality note**: how the burden is matched to the counterparty.
- **Draft/redline** of the clauses. One JSON finding per issue with `category: "esg-clause"`.

## Edge cases & pitfalls

- **Greenwashing boilerplate**: aspirational "we/they will be sustainable" clauses with no metric or audit are unenforceable and can themselves create greenwashing/misrepresentation liability — make them measurable and substantiable.
- **No teeth**: ESG obligations with no audit right or remedy ladder are decorative — the counterparty has no reason to comply.
- **Over-reach on SMEs**: handing a small supplier a Fortune-500 ESG annex gets a refusal or a sign-and-ignore — proportion to size and risk.
- **Missing flow-down**: if the client's own CSDDD/import-ban duties require sub-tier information and the contract doesn't secure it, the client can't meet its own law — flow the duty down.
- **Hair-trigger termination**: a right to terminate on any ESG slip is unusable against a critical supplier — reserve termination for serious or uncured breaches.

## References

- Volatile facts: `EU-CRA-01` where product-cyber obligations overlap; cite `[verify current]` for CSDDD/CSRD scope and timelines and forced-labour import-ban rules — all fast-moving.
- The client's supplier code and ESG policies; the applicable due-diligence/reporting regimes (EU CSDDD, CSRD/ESRS, forced-labour import bans, India BRSR); ILO core labour standards.
