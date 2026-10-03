---
name: regulatory-accessibility-compliance
description: >-
  Assesses a digital product against the converging accessibility regimes — WCAG 2.1/2.2 as the technical baseline, US
  Section 508 + ADA, the EU European Accessibility Act, and India's RPwD Act 2016 — determining which apply, the
  conformance level and deadline, the legal exposure, and the remediation priorities. Use to scope accessibility
  obligations or triage a risk/complaint. Not for the readability redesign of a document → drafting/legal-design-
  review; not for the broad which-laws-apply triage → regulatory/applicability-mapper.
module: regulatory
version: 1.0.0
jurisdictions: [global, EU, US, IN]
risk_tier: review-required
inputs:
  - name: product
    required: true
    description: The digital product/service — type (website, mobile app, SaaS, e-commerce, banking, ticketing, e-book/e-reader), audience (consumer/public-sector/employee), and markets it serves.
  - name: trigger
    required: false
    description: Why now — a procurement requirement, an EAA deadline, a received complaint/demand letter, a public-sector obligation, or a proactive audit.
  - name: posture
    required: false
    description: Any existing accessibility work — a VPAT/conformance statement, prior WCAG audit, or accessibility statement already published.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [drafting/legal-design-review, regulatory/applicability-mapper, contracts/terms-of-service-audit, regulatory/product-cyber-obligations, regulatory/regulatory-change-monitor]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Digital Accessibility

Takes a digital product and returns which accessibility regime applies (WCAG baseline, US Section 508/ADA, EU EAA, India RPwD), the required conformance level and deadline, the legal exposure, and the remediation priorities. The deliverable is an applicability + exposure assessment with a prioritised fix list, not a raw automated-scan dump.

## When to use / not use

- Use: scoping which accessibility laws apply to a website/app/service and to what level; triaging an accessibility complaint, demand letter or procurement blocker; preparing for an EAA deadline; turning a WCAG audit into a legal-risk-prioritised remediation plan; drafting/validating an accessibility statement.
- Hand off: improving a *document's* readability/usability/layout (not digital-product conformance) → `drafting/legal-design-review`; the broad "which regulations apply to us" triage → `regulatory/applicability-mapper`; the consumer-law/terms audit of an online service → `contracts/terms-of-service-audit`; product cyber/CE-type obligations → `regulatory/product-cyber-obligations`; tracking regime changes over time → `regulatory/regulatory-change-monitor`.

## Inputs to collect first

1. The **product type** (website, mobile app, SaaS, e-commerce, banking, ticketing/transport, e-book/e-reader, self-service terminal) and whether it's **consumer, public-sector, or employee**-facing.
2. The **markets served** — EU (EAA), US (federal procurement vs private ADA), India (RPwD / public vs private).
3. The **trigger** — a procurement VPAT request, an EAA deadline, a complaint/demand letter, or a proactive audit.
4. The **current posture**: any VPAT/conformance statement, prior WCAG audit, or published accessibility statement.

## Method

1. **Determine applicability per regime first.** US **Section 508** binds federal agencies and their vendors (VPAT/ICT); the **ADA** drives private-sector web-accessibility litigation via DOJ guidance and case law (no single federal web standard, but WCAG is the de-facto benchmark). The **EAA** (Directive 2019/882) applies to specified products/services (e-commerce, banking, e-books, ticketing, etc.) from **28 June 2025**, with micro-enterprise and disproportionate-burden carve-outs. India's **RPwD Act 2016** + rules and the GIGW guidelines bind government and, increasingly, private services `[verify current]`.
2. **Set the technical baseline — WCAG.** Almost every regime resolves to **WCAG 2.1 (often moving to 2.2) at level AA** as the conformance target. Fix the exact version and level each applicable regime demands rather than assuming "WCAG AA" universally.
3. **Separate real conformance from an automated scan.** Automated tools catch ~30-40% of issues; the legally material failures (keyboard operability, focus order, meaningful alt text, form labels, captions, contrast, screen-reader semantics) need manual + assistive-technology testing. Don't let a green scan imply conformance.
4. **Prioritise by user impact and legal exposure, not by scan severity.** A single blocking barrier on a core journey (checkout, login, account recovery) outweighs dozens of cosmetic issues — rank remediation by whether a disabled user can complete the critical task.
5. **Map the legal exposure per regime.** Private ADA suits/demand letters (US), EAA market-surveillance enforcement + withdrawal risk (EU), public-procurement disqualification (508/India), and reputational harm. State what a failure actually triggers.
6. **Check the accessibility statement / conformance documentation.** EAA and public-sector regimes require a published accessibility statement; procurement requires a VPAT — validate it is accurate (a false statement is its own exposure), not aspirational.
7. **Handle carve-outs properly.** Disproportionate-burden and micro-enterprise exemptions under the EAA must be **assessed and documented**, not assumed — an undocumented "it's too hard" is not a defence.
8. **Build the remediation roadmap** — blocking barriers on critical journeys first, then AA gaps, then enhancements — with owners and the regime deadline.
9. **Score against the Checks table** and output applicability + conformance target + exposure + prioritised remediation.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Applicability / deadline not established | Per-regime scope + date resolved | S1 | Determine applicability first `[verify current]` |
| Wrong WCAG version/level assumed | Exact version + level per regime fixed | S2 | Set the right target |
| Automated scan treated as conformance | Manual + AT testing of key journeys done | S1 | Add manual/AT testing |
| Remediation ranked by scan, not impact | Blocking barriers on core journeys first | S2 | Re-prioritise by task completion |
| Legal exposure not mapped | Suit/enforcement/procurement risk stated | S2 | Map the exposure per regime |
| Accessibility statement inaccurate/missing | Statement + VPAT accurate where required | S2 | Fix or publish the statement |
| Carve-out assumed, not documented | Disproportionate-burden assessed + recorded | S2 | Document the exemption or drop it |
| No owned remediation roadmap | Prioritised fixes + owners + deadline | S3 | Build the roadmap |

## Output

Lead with `Accessibility: <regimes that apply> — target <WCAG x.x AA> — top risk: <the blocking barrier or deadline>`. Then the output contract. Add:

- **Applicability**: which regimes, scope, conformance level, deadline.
- **Conformance gaps**: the legally material failures (not the full scan), by user journey.
- **Exposure**: what a failure triggers per regime.
- **Remediation roadmap**: blocking barriers first, with owners and the deadline.
- One JSON finding per gap with `category: "accessibility"`.

## Edge cases & pitfalls

- **Green-scan complacency**: an automated pass misses keyboard, focus, semantics and alt-text quality — the exact issues that drive complaints.
- **"WCAG AA" without a version**: 2.1 vs 2.2 and the specific success criteria differ; naming the wrong one under-scopes the work.
- **Assuming the ADA has a fixed web standard**: it doesn't — but WCAG AA is the practical benchmark courts and the DOJ reference, so "no standard" is not a defence.
- **Undocumented disproportionate burden**: claiming the EAA exemption without the documented assessment is no defence.
- **Aspirational accessibility statement**: publishing a conformance claim the product doesn't meet creates fresh liability.

## References

- Volatile facts: cite `[verify current]` on EAA scope/dates, the applicable WCAG version/level, and RPwD/GIGW private-sector reach — all are moving.
- The governing instruments (WCAG 2.1/2.2; US Section 508 / ADA + DOJ guidance; EU Directive 2019/882 (EAA) + EN 301 549; India RPwD Act 2016, rules and GIGW) and current regulator/standards guidance.
