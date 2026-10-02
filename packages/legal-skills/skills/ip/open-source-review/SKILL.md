---
name: ip-open-source-review
description: >-
  Classifies software dependencies and third-party content by licence obligation and decides SHIP, SHIP WITH
  CONDITIONS or BLOCK for the intended use (internal, SaaS, distributed, embedded, on-prem). Use when engineering
  shares an SBOM, a package list or a new dependency, asks "can we use this library", or before a release, M&A
  disclosure or customer audit. Not for ownership of our own code → ip/ip-ownership-audit; not for licensing
  AI skills into AEGIS → platform/skill-security-audit.
module: ip
version: 1.0.0
jurisdictions: [global, IN, EU, UK, US]
risk_tier: review-required
inputs:
  - name: components
    required: true
    description: SBOM (SPDX or CycloneDX), lockfile, package list or a single component with version and declared licence.
  - name: use_model
    required: true
    description: How the product reaches users - internal only, SaaS/hosted, distributed binary, mobile app, embedded/firmware, on-prem delivery to customers, or source release.
  - name: modification_and_linking
    required: false
    description: Whether components are modified, statically or dynamically linked, run as separate processes, or called over a network.
  - name: policy
    required: false
    description: Organisation open-source policy (allow/review/deny lists). Falls back to the defaults below.
  - name: context
    required: false
    description: Release, M&A due diligence, customer audit, CRA conformity, open-sourcing our own code.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [ip/ip-ownership-audit, ip/copyright-assessment, corporate/ma-due-diligence, regulatory/product-cyber-obligations, regulatory/export-controls, platform/skill-security-audit, contracts/saas-and-cloud-review]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Open-Source Review

Licence risk is almost never in the licence text alone; it is in the licence **plus** how we use the code. A GPL library is harmless in an internal tool and a release blocker in shipped firmware; an AGPL service is harmless on a laptop and a source-disclosure obligation once users reach it over a network. This skill puts every component in a licence family, applies the use model, and returns a component-by-component decision with the exact conditions engineering must satisfy to ship.

## When to use / not use

- Use for: new dependency requests, pre-release scans, SBOM triage, customer or M&A open-source questionnaires, inbound code contributions, deciding the outbound licence when we open-source something, fonts/images/datasets/model weights under public licences.
- Hand off: chain of title to code we wrote or commissioned → `ip/ip-ownership-audit`; whether a non-software work is protected or fair-dealing applies → `ip/copyright-assessment`; CRA/vulnerability-handling duties → `regulatory/product-cyber-obligations`; encryption components in exported products → `regulatory/export-controls`; SKILL.md/prompt packs → `platform/skill-security-audit`.

## Inputs to collect first

1. **Use model** per product (not per company). It is the single fact that most changes the answer. If unknown, assume **distributed** (the stricter case) and say so.
2. **Exact licence identifier and version** (SPDX ID, e.g. `GPL-2.0-only` vs `GPL-2.0-or-later`). "GPL" without a version is a gap.
3. **Integration**: modified or not; static link, dynamic link, plugin into a host, separate process/CLI, network API, copy-paste of snippets.
4. Whether the component came from a **declared** licence (package manifest) or a **concluded** licence (file headers, LICENSE file, scanner). Disagreement between them is a finding.

## Method

1. **Normalise** every component to an SPDX licence expression. Resolve `OR` (we may choose; pick the most permissive that fits) and `AND` (all apply). No licence file, no header, no manifest → `NOASSERTION` → treat as **unlicensed**.
2. **Classify** into a family using the table below.
3. **Apply the trigger test** for that family against the use model:
   - Permissive → trigger is *distribution* (notice obligations only).
   - Weak copyleft → trigger is *distribution of modified files / the library*; scope limited to file (MPL, EPL) or library (LGPL).
   - Strong copyleft → trigger is *distribution* of a work based on the component; scope is the combined work.
   - Network copyleft → trigger is *distribution* **or** letting users *interact with modified software over a network*.
   - Source-available / non-commercial / no-derivatives → trigger is *any use* outside the grant; there is no "internal use is fine" safe harbour unless the text says so.
4. **Decide** per component:
   - **SHIP** — permissive, or copyleft whose trigger is not met by the use model.
   - **SHIP WITH CONDITIONS** — trigger met, and obligations can be satisfied (notices, source offer, relinking, file-level disclosure) without exposing proprietary code we will not release.
   - **BLOCK** — trigger met and compliance would require releasing proprietary code we will not release; or the licence forbids our use (NC, field-of-use, SSPL/ELv2 managed-service bans, BSL production limits); or unlicensed; or licence unknown in a shipped product.
5. **Aggregate**: product rating = highest component severity. Three or more S2s of the same family in one product roll up to S1 for that product (severity-scale rule).
6. **Write conditions** as engineering tasks (e.g. "ship NOTICE file listing X; dynamically link Y; publish modified files of Z at URL").
7. **Record** the result in SBOM form (SPDX `LicenseConcluded`, `LicenseDeclared`, `CopyrightText`) so the next review diffs rather than restarts.

## Checks / licence family table

| Family / examples (SPDX) | Obligation and trigger | Internal | SaaS | Distributed / embedded | Default severity if mishandled |
|---|---|---|---|---|---|
| Permissive: `MIT`, `BSD-2/3-Clause`, `ISC`, `Zlib` | Keep copyright + licence text in distributions | SHIP | SHIP | SHIP + notices | S4 (missing notice) |
| `Apache-2.0` | Notices, carry `NOTICE` file, state modified files; patent licence terminates if we sue over the work (s.3) | SHIP | SHIP | SHIP + notices | S4; S3 if we hold patents and litigate in the field |
| Weak copyleft (library): `LGPL-2.1`, `LGPL-3.0` | Distribute library source + modifications; permit user relinking/replacement (LGPL-2.1 s.6; LGPL-3.0 s.4) and reverse engineering for debugging those modifications | SHIP | SHIP | SHIP WITH CONDITIONS: dynamic linking, no anti-relink locks | S2 if statically linked in closed firmware |
| Weak copyleft (file): `MPL-2.0`, `EPL-2.0`, `CDDL-1.0` | Make source of the *covered files* (and modifications) available; larger work may be proprietary | SHIP | SHIP | SHIP WITH CONDITIONS | S3 |
| Strong copyleft: `GPL-2.0`, `GPL-3.0` | Distribute complete corresponding source of the whole work based on it under GPL (GPL-2.0 s.3; GPL-3.0 s.6); GPL-3.0 adds installation information for user products (s.6) and patent terms (s.11) | SHIP | SHIP (no distribution) | BLOCK if combined with proprietary code we will not release; CONDITIONS if separate program (aggregate / arm's-length process) | S1 in shipped product with proprietary linking |
| Network copyleft: `AGPL-3.0` | GPL-3.0 plus s.13: users interacting with a *modified* version over a network must be offered its source | SHIP (no external users) | BLOCK if modified and user-facing, unless we will publish; CONDITIONS if unmodified and isolated | BLOCK unless releasing | S1 in modified, user-facing SaaS |
| Source-available: `BUSL-1.1` | Production use limited by the "Additional Use Grant"; converts to the named open licence on the Change Date | Read the grant | Usually BLOCK for competing hosted offering | Read the grant | S2–S1 |
| `SSPL-1.0` | s.13: offering the program as a service requires releasing source of the entire service stack | SHIP (internal) | BLOCK as a service | Review | S1 if offered as a service |
| `Elastic-2.0` | No providing as a hosted/managed service; no circumventing licence keys; keep notices | SHIP | BLOCK if the service exposes the product's functionality | Review | S1–S2 |
| "Commons Clause", custom "non-commercial", "ethical" / field-of-use licences (e.g. `JSON` "Good, not Evil") | Restrictions on selling or on uses; vague terms are themselves the risk | Review | BLOCK for commercial | BLOCK for commercial | S2 |
| Creative Commons: `CC-BY-4.0`, `CC-BY-SA-4.0` | Attribution; SA = adaptations under same licence. Not designed for software code | SHIP for content | SHIP w/ attribution | SHIP w/ attribution | S3 |
| `CC-BY-NC-*`, `CC-BY-ND-*` | NC: no commercial use; ND: no adaptations shared | BLOCK for commercial | BLOCK | BLOCK | S2 (S1 if core to product) |
| `CC0-1.0`, `Unlicense`, `0BSD` | Public-domain dedication / waiver; note CC0 expressly withholds patent licence | SHIP | SHIP | SHIP | Info |
| No licence / `NOASSERTION` / "copied from Stack Overflow / a blog" | All rights reserved by default (Copyright Act 1957 s.14 (IN); Berne Convention); public visibility on a code host is not a licence | BLOCK | BLOCK | BLOCK | S2; S1 if shipped |
| Model weights / datasets (e.g. RAIL-style, Llama-style community licences, ODbL) | Use-based restrictions, user-count thresholds, attribution, share-alike on databases | Review | Review | Review | S2 until read |

## Compatibility rules (combined works)

- Apache-2.0 into GPL-2.0-only: incompatible (patent/termination terms). Into GPL-3.0: compatible.
- GPL-2.0-only and GPL-3.0-only: mutually incompatible in one combined work. `-or-later` resolves this.
- MPL-2.0 is GPL-compatible unless the file is marked "Incompatible With Secondary Licenses" (Exhibit B).
- CDDL and GPL: widely regarded as incompatible for combined distribution `[general principle — verify]`.
- Dual-licensed (`GPL-2.0 OR commercial`): our choice; if we do not hold the commercial licence, GPL governs.

## Risk factors that move severity

- **Up**: proprietary code linked into a strong-copyleft component in a distributed product; GPL-3.0 in locked consumer devices (installation information); AGPL modified in customer-facing SaaS; licence text altered from the standard; licence changed upstream between versions (relicensing to BSL/SSPL/ELv2 — pin the last open version); contributor licence agreement absent on our own open-source project.
- **Down**: component used only in build/test tooling and not shipped; separate process communicating via documented interfaces; code removed before release (confirm with a rescan, not a statement).

## India-specific checks

- Software is a "literary work" (Copyright Act 1957 s.2(o)); licences must be in writing and should specify rights, duration and territory (s.30, s.30A read with s.19). An open-source licence that is silent on duration/territory is generally read as perpetual and worldwide for that work `[general principle — verify]`; do not rely on the s.19(5)/(6) five-year/India-only defaults to cut down an open-source grant without counsel review.
- Infringement remedies: civil (ss.51, 55) and criminal (s.63; s.63B knowing use of infringing computer program). A shipped unlicensed component is therefore S1, not S2, where knowing use is arguable.
- Government and PSU customers (GeM procurements, MeitY's Policy on Adoption of Open Source Software for Government of India, 2015) may *require* open-source disclosures or preferences — check the tender.
- Customer contracts with Indian enterprises frequently include an IP warranty of "no open source that requires disclosure of source code"; check the warranty against the scan, not just the licence list → `contracts/contract-review`.

## Other jurisdictions

- **US**: open-source licence conditions are enforceable as copyright conditions, not merely contract covenants — *Jacobsen v. Katzer*, 535 F.3d 1373 (Fed. Cir. 2008) `[unverified — run research/citation-verification]`. Exposure includes injunction and statutory damages where registration exists (17 U.S.C. §§ 412, 504).
- **EU**: Software Directive 2009/24/EC governs computer programs; interoperability decompilation (Art. 6). Cyber Resilience Act (Reg. (EU) 2024/2847) treats manufacturers integrating open-source components as responsible for due diligence on them, and creates a lighter regime for "open-source software stewards" — see `EU-CRA-01` `[verify current]` and hand off to `regulatory/product-cyber-obligations`.
- **UK**: Copyright, Designs and Patents Act 1988 s.16 (restricted acts), s.50A–50C (permitted acts for programs).
- Germany has a track record of injunctions for GPL non-compliance `[general principle — verify]`.

## Output

Lead with `Decision: SHIP | SHIP WITH CONDITIONS | BLOCK — <product> — <highest-severity reason>`. Then follow `_shared/output-contract.md` (category `licence`). Add a **Component register** between Findings and Actions:

| Component@version | SPDX declared | SPDX concluded | Family | Use / integration | Decision | Conditions | Severity |
|---|---|---|---|---|---|---|---|

And a **Compliance pack** checklist for SHIP WITH CONDITIONS: third-party notices file, licence texts, source offer or source bundle (GPL-2.0 s.3(b) three-year written offer if not shipping source), relinking materials (LGPL), build/installation information (GPL-3.0 user products), SBOM export (SPDX 2.3 or CycloneDX).

## Edge cases & pitfalls

- "We only use it on our servers" is not a defence for AGPL modifications or SSPL/ELv2 managed-service bans.
- Mobile apps are distribution. So are on-prem installers, Docker images pushed to customers, JavaScript sent to browsers (permissive notices still needed in minified bundles).
- Transitive dependencies carry the same obligations; a permissive top-level package can pull in GPL.
- Licence scanners mis-detect (e.g. "GPL" in a comment, licence of a test fixture). Confirm concluded licence from the actual LICENSE file before blocking.
- Relicensed projects: check the licence of the **exact version** pinned, not the project's current licence.
- Do not treat CC licences, or "free for non-commercial use", as software licences that permit commercial deployment.
- Snippets from Q&A sites carry that site's content licence (often CC BY-SA) — attribution and share-alike can apply.
- AI-generated code may reproduce licensed code; treat large verbatim matches flagged by scanners like any other component.

## References

- Volatile facts: `EU-CRA-01` (CRA reporting from 11 Sep 2026; main obligations from 11 Dec 2027) `[verify current]`.
- SPDX License List and SPDX 2.3 specification (spdx.org); OSI approved licence list (opensource.org).
