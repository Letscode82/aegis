---
name: disputes-document-disclosure
description: >-
  Plans document disclosure/discovery: scope and relevance, the search-and-collection method (custodians, sources,
  keywords, de-duplication), privilege review (legal advice / litigation privilege, waiver and redaction), and the
  production mechanics (format, confidentiality tiering, a defensible log). Use to plan or run disclosure, or to review
  an opponent's production. Not for the upstream preserve-everything duty → disputes/litigation-hold; not for the
  overall case strategy → disputes/early-case-assessment.
module: disputes
version: 1.0.0
jurisdictions: [global, IN, UK, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of plan (design the disclosure exercise), privilege-review (triage documents for privilege/redaction) or review-production (assess the completeness/privilege of a received production).
  - name: matter
    required: false
    description: The dispute and forum (the disclosure rules differ by forum), the issues in play (which define relevance), and the data sources/custodians involved.
  - name: constraints
    required: false
    description: The disclosure order/rules and any agreed protocol, proportionality limits, deadlines, and confidentiality/data-protection constraints on cross-border review.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [disputes/litigation-hold, disputes/early-case-assessment, disputes/arbitration-strategy, privacy/cross-border-transfer, disputes/deadline-calendar]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Disclosure & Production Review

Takes a disclosure obligation and returns a defensible plan: what's in scope, how it will be found and collected, how privilege is protected, and how it will be produced — so the exercise is proportionate, complete, and doesn't leak privilege. The deliverable is a disclosure plan (or a review of one) with the privilege and proportionality risks flagged, not a generic "collect the documents".

## When to use / not use

- Use: scoping and running disclosure/discovery; designing the search and collection; triaging documents for privilege and redaction; producing documents in the right format with a defensible log; auditing an opponent's production for gaps or over-redaction.
- Hand off: the duty to **preserve** documents once litigation is anticipated (the step before disclosure) → `disputes/litigation-hold`; the merits/strategy that defines what matters → `disputes/early-case-assessment`; the arbitration-specific production expectations (IBA Rules etc.) → `disputes/arbitration-strategy`; the data-protection mechanism for reviewing/exporting personal data across borders → `privacy/cross-border-transfer`; the disclosure-deadline calculation → `disputes/deadline-calendar`.

## Inputs to collect first

1. The **forum and its disclosure rules/order** — US discovery, English disclosure (PD 57AD/CPR 31), Indian discovery, or an arbitral protocol differ sharply on scope and process.
2. The **issues in dispute** — relevance is defined by the issues, not by "everything about the matter".
3. The **data sources and custodians** (email, chat, shared drives, devices, cloud apps, structured systems) and their volumes.
4. The **deadlines**, proportionality limits, and any confidentiality / data-protection / cross-border constraints.

## Method

1. **Define relevance from the issues.** Map the disclosure scope to the pleaded issues and the governing rule's test (e.g. documents a party relies on + that adversely affect/support a case, or the forum's broader/narrower standard). Over-collection wastes cost; under-collection risks sanctions.
2. **Confirm preservation is in place.** Verify a litigation hold already covers the sources — collecting from sources that weren't preserved invites spoliation arguments → `disputes/litigation-hold`.
3. **Design the search and collection.** Identify custodians and sources; agree keywords/date ranges/filters (and, where used, TAR/analytics); de-duplicate and thread; forensically collect so metadata and chain-of-custody survive.
4. **Run a layered privilege review.** Separate **legal advice privilege** and **litigation privilege** (and local equivalents); watch for loss of privilege through waiver, mixed business/legal content, in-house-counsel limits in some jurisdictions, and third-party sharing. Log each privilege call with its basis.
5. **Redact, don't withhold wholesale.** Redact privileged/irrelevant-sensitive portions of otherwise-disclosable documents; produce the rest. Blanket withholding of partly-privileged documents is a common over-reach.
6. **Build the privilege log / disclosure certificate.** Produce the log (document, date, type, basis for withholding) to the required standard, and the disclosure statement/certificate confirming the search was reasonable.
7. **Handle confidentiality and data protection.** Apply confidentiality tiers / clawback and protective orders; for personal data, address the data-protection basis and any cross-border review/export → `privacy/cross-border-transfer`.
8. **Produce in the right form.** Agreed format (native/TIFF+load file, Bates/continuity numbering, metadata fields); keep the production set, the log, and the search record aligned.
9. **For review-of-opponent mode:** test completeness against the issues, probe suspicious gaps/date-cliffs, and challenge over-broad redactions or thin privilege logs.
10. **Score against the Checks table** and set a readiness/assessment: **DEFENSIBLE / DEFENSIBLE WITH FIXES / NOT DEFENSIBLE**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Scope not tied to the issues / forum test | Relevance mapped to pleaded issues + the rule | S1 | Re-scope to the issues and the standard |
| Collecting from unpreserved sources | Litigation hold confirmed over all sources | S1 | Preserve first → litigation-hold |
| Metadata / chain-of-custody not preserved | Forensically sound collection | S1 | Re-collect defensibly |
| Privilege types conflated or mis-called | Advice vs litigation privilege applied; waiver checked | S1 | Re-review; log each call's basis |
| Whole documents withheld instead of redacted | Redact-and-produce the non-privileged parts | S2 | Redact and release |
| Privilege log / disclosure statement inadequate | Log + certificate to the required standard | S2 | Build the compliant log |
| Proportionality ignored (over/under-collection) | Search proportionate to the issues and value | S2 | Right-size the search |
| Personal-data / cross-border review unaddressed | DP basis + transfer mechanism in place | S2 | Add the DP step → cross-border-transfer |
| Production format not agreed/consistent | Agreed format + numbering + load files | S3 | Conform the production set |
| (Review mode) gaps / over-redaction unchallenged | Completeness + redaction tested against issues | S2 | Raise the deficiency |

## Output

Lead with `Disclosure: DEFENSIBLE | DEFENSIBLE WITH FIXES | NOT DEFENSIBLE — <matter> — <key risk>`. Then the output contract. Add:

- **Scope & relevance**: the issues → what's in/out, under which rule.
- **Search & collection**: custodians · sources · keywords/filters · de-dup · collection method.
- **Privilege**: review approach, the log, redaction policy, waiver risks.
- **Production**: format, numbering, confidentiality tiers, clawback.
- One JSON finding per issue with `category: "disclosure"`.

## Edge cases & pitfalls

- **Relevance ≠ "everything"**: scoping to the whole matter instead of the pleaded issues blows cost and proportionality; scope to the issues under the forum's test.
- **Collecting before preserving**: pulling from sources a hold never covered opens a spoliation flank — confirm preservation first.
- **Privilege waiver by sharing**: forwarding legal advice to third parties or mixing it into business chains can waive privilege — review for it, don't assume.
- **Over-redaction**: redacting far more than the privileged text invites a challenge and looks like concealment — redact narrowly, log precisely.
- **Metadata destroyed by amateur collection**: drag-and-drop copying strips metadata and chain-of-custody — collect forensically where it matters.

## References

- Volatile facts: `IN-COMM-01` (Commercial Courts disclosure interactions) and cross-border DP via `privacy/cross-border-transfer`; cite `[verify current]` where a forum's disclosure rule or privilege doctrine is load-bearing.
- The forum's disclosure/discovery rules (US FRCP discovery, English PD 57AD / CPR 31, Indian CPC Order XI, or the arbitral protocol/IBA Rules); privilege doctrine; and any protective order / data-protection constraints.
