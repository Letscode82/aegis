---
name: regulatory-product-cyber-obligations
description: >-
  Assesses a connected product's cybersecurity obligations as a manufacturer/supplier: EU Cyber Resilience Act
  (security-by-design, vulnerability handling, actively-exploited-vuln and incident reporting, SBOM, support period,
  CE/conformity), plus UK PSTI and sectoral/IoT duties. Use to scope CRA readiness for a product with digital
  elements, gap-assess vulnerability-handling, or review supplier obligations. Not for an org-wide ISMS/SOC2 mapping
  → regulatory/security-frameworks; not for operational resilience of a financial entity → regulatory/operational-resilience.
module: regulatory
version: 1.0.0
jurisdictions: [EU, UK, global]
risk_tier: review-required
inputs:
  - name: product
    required: true
    description: The product with digital elements — hardware+software or standalone software — its function, connectivity, and whether it is placed on the EU/UK market.
  - name: role
    required: false
    description: Manufacturer, importer or distributor (CRA duties differ), and whether the product is "important" or "critical" class under the CRA.
  - name: current_state
    required: false
    description: Existing security-by-design practices, vulnerability-handling/PSIRT process, SBOM, update mechanism, declared support period, and conformity work.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [regulatory/security-frameworks, regulatory/operational-resilience, ip/open-source-review, contracts/vendor-due-diligence, privacy/breach-response]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Product Cybersecurity Obligations

Takes a connected product and maps the manufacturer-side cybersecurity duties that now gate market access — above all the EU Cyber Resilience Act — into a readiness view: security-by-design, a working vulnerability-handling process, the reporting clocks, SBOM, a declared support period, and conformity. The deliverable is a CRA/PSTI readiness assessment with gaps, not a summary of the regulation.

## When to use / not use

- Use: scoping CRA readiness for a product with digital elements before it's placed on the EU market; gap-assessing vulnerability-handling / update / SBOM obligations; reviewing a supplier's product-security duties; UK PSTI / consumer-IoT security checks.
- Hand off: the organisation's own ISMS / ISO 27001 / SOC 2 posture → `regulatory/security-frameworks`; operational resilience of a financial entity → `regulatory/operational-resilience`; open-source/licence obligations in the SBOM → `ip/open-source-review`; assessing a *supplier* broadly → `contracts/vendor-due-diligence`; a live incident's data-breach side → `privacy/breach-response`.

## Inputs to collect first

1. The product: function, connectivity, whether hardware+software or standalone software, and whether it's placed on the EU/UK market.
2. The role: manufacturer, importer, or distributor (duties differ), and the CRA product class (default / important / critical).
3. Current state: security-by-design practices, PSIRT/vulnerability-handling, SBOM, secure-update mechanism, declared support period, conformity/CE work.

## Method

1. **Confirm scope and role.** The CRA (Reg. (EU) 2024/2847) covers "products with digital elements" placed on the EU market; obligations and conformity routes escalate by class (default / important / critical). Importers and distributors carry duties too. State what binds and from when — manufacturer reporting duties (Art. 14) apply from **11 Sep 2026** and main obligations from **11 Dec 2027** (cite `EU-CRA-01`) `[verify current]`.
2. **Security-by-design & by-default.** Assess whether the product ships without known exploitable vulnerabilities, with a secure default configuration, minimised attack surface, and protection of confidentiality/integrity of data and functions (CRA Annex I Part I).
3. **Vulnerability handling process (Annex I Part II).** A real PSIRT process: identify and document vulnerabilities (incl. via an SBOM), remediate without delay, provide **security updates** (ideally automatic/separable), a coordinated disclosure policy, and a point of contact. This is where most products fail readiness.
4. **SBOM.** A software bill of materials covering top-level dependencies — both a CRA expectation and the backbone of vulnerability tracking → `ip/open-source-review` for the licence side.
5. **Reporting clocks (CRA Art. 14).** Duties to report **actively exploited vulnerabilities** and **severe incidents** to the CSIRT/ENISA on short early-warning + follow-up timelines — map the specific windows `[verify current]`. This is the product-side analogue of NIS2/DORA incident reporting.
6. **Support period.** A declared support/update period appropriate to the product (the CRA expects a minimum horizon); the end-of-support must be communicated. "Patches for a year then silence" is a gap.
7. **Conformity & CE marking.** The applicable conformity-assessment route for the product class, technical documentation, EU declaration of conformity, and CE marking — market access depends on it.
8. **UK PSTI / consumer IoT** where relevant: no universal default passwords, a vulnerability-disclosure contact, and a declared minimum security-update period for consumer connectable products.
9. **For supplier-review mode**, test the supplier's product-security duties and flow-down (update commitments, disclosure, SBOM, support horizon) into the contract → `contracts/vendor-due-diligence`.
10. **Score against the Checks table** and set a decision: **MARKET-READY / READY WITH CONDITIONS / NOT READY**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| No vulnerability-handling / PSIRT process | Documented identify→remediate→update→disclose process | S1 | Stand up the process; it's the CRA core |
| Actively-exploited-vuln / incident reporting not wired | CRA Art. 14 clocks + contact mapped | S1 | Build the reporting runbook |
| Ships with known exploitable vulnerabilities / insecure defaults | Clean + secure-by-default at release | S1 | Remediate before placing on market |
| No secure update mechanism | Timely (ideally automatic/separable) security updates | S2 | Add the update channel |
| No SBOM | SBOM for top-level dependencies, maintained | S2 | Generate + maintain the SBOM → `ip/open-source-review` |
| No declared support period | Appropriate, communicated support horizon | S2 | Declare + communicate end-of-support |
| Conformity/CE not addressed (in-scope product) | Correct assessment route + DoC + CE | S2 | Complete conformity before market |
| UK PSTI basics missing (consumer IoT) | No default passwords + disclosure contact + update period | S2 | Remediate the PSTI basics |
| Supplier product-security duties not flowed down | Update/disclosure/SBOM/support in the contract | S3 | Add flow-down → `contracts/vendor-due-diligence` |

## Output

Lead with `Status: MARKET-READY | READY WITH CONDITIONS | NOT READY — <product> — <key reason>`. Then the output contract. Add:

- **Scope & role**: product class, role, applicable regimes, and the commencement dates that bind.
- **Readiness map**: security-by-design · vulnerability handling · updates · SBOM · reporting · support period · conformity — status each.
- **Gap list** ranked with owner and the hard deadline where a commencement date drives it. One JSON finding per gap with `category: "product-cyber"`.

## Edge cases & pitfalls

- **Software-only is in scope**: the CRA is not just hardware — standalone software with digital elements placed on the EU market is covered.
- **Reporting starts before the main obligations**: Art. 14 reporting duties bite earlier (2026) than the full obligation set (2027) — don't plan to the later date for incident reporting `[verify current]`.
- **SBOM is operational, not paperwork**: without it you cannot know which shipped products a new CVE affects — it's the engine of vulnerability handling.
- **Support period as a sales decision**: picking a short support horizon to cut cost can itself be non-compliant and must be disclosed to buyers.
- **Open-source ≠ no duty**: using OSS doesn't offload the manufacturer's vulnerability-handling and SBOM obligations.

## References

- Volatile facts: `EU-CRA-01` (CRA commencement dates). Cite live where a reporting window or applicability date is load-bearing; mark `[verify current]`.
- Regulation (EU) 2024/2847 (Cyber Resilience Act) incl. Annex I (essential requirements) and Art. 14 (reporting); UK Product Security and Telecommunications Infrastructure (PSTI) regime; sectoral/IoT product-security standards (e.g. ETSI EN 303 645).
