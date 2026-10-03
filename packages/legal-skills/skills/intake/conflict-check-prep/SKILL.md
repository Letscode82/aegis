---
name: intake-conflict-check-prep
description: >-
  Prepares a conflict-of-interest check before a matter opens: extracts every party, affiliate, beneficial owner,
  adverse party and material related name from the request, builds the search terms (including aliases and former
  names), and frames the adversity and confidentiality questions the check must answer. Use to assemble the inputs for
  a conflicts search and spot obvious conflicts early. Not for scoping the matter's work → intake/matter-scoping; not
  for triaging/routing the request → intake/request-triage.
module: intake
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: request
    required: true
    description: The matter request / engagement details — who wants the work, against whom, about what, and any documents naming the parties.
  - name: known_relationships
    required: false
    description: Any already-known prior engagements, related entities, or existing clients that might bear on the check.
  - name: scope
    required: false
    description: Whether this is a new client or existing, the type of matter, and whether an information barrier might be contemplated.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [intake/matter-scoping, intake/request-triage, disputes/early-case-assessment, corporate/ma-due-diligence, matters/matter-plan]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Conflict Check Preparation

Takes a new matter request and produces the complete, de-duplicated set of names and search terms a conflicts check needs — every party, affiliate, beneficial owner and adverse interest — plus the adversity/confidentiality questions to resolve. The deliverable is a conflict-search brief that lets the run catch real conflicts, not a one-line "run conflicts".

## When to use / not use

- Use: before opening a matter or accepting an engagement; assembling the party list and search terms for a conflicts database run; spotting an obvious direct conflict early; preparing the facts for a conflicts-waiver decision.
- Hand off: defining the actual work/deliverables of the matter → `intake/matter-scoping`; routing and prioritising the incoming request → `intake/request-triage`; the merits/strategy once the matter is cleared → `disputes/early-case-assessment`; mapping a target's corporate tree in an acquisition → `corporate/ma-due-diligence`; planning the matter after clearance → `matters/matter-plan`.

## Inputs to collect first

1. The **client** (and who within it instructs) and whether they are new or existing.
2. The **adverse parties** — opponents, counterparties, and anyone whose interests are against the client's.
3. **Affiliates and related names**: parent/subsidiaries, beneficial owners, directors/officers, trading names, former names, and key individuals.
4. The **subject matter** (to test issue/positional conflicts and confidentiality overlap with other matters).
5. Any known prior dealings with any of these names.

## Method

1. **Enumerate every party and role.** Client, adverse parties, and interested third parties (insurers, guarantors, co-defendants, lenders) — each tagged with its role, because adversity depends on role, not just name.
2. **Expand entities to their web.** For each corporate party, capture parent, material subsidiaries, beneficial owners, and key individuals (directors, signatories) — conflicts hide in affiliates, not the headline name.
3. **Generate name variants.** Add trading/brand names, former names, abbreviations, transliteration/spelling variants, and individual aliases — a search on the exact legal name alone misses the real match.
4. **Build the search-term set.** Produce the de-duplicated list of strings to run against the conflicts database, grouped by party, with the variants attached. This is the core deliverable.
5. **Frame the adversity questions.** State who is adverse to whom and on what; note **positional/issue conflicts** (taking a stance against a position held for another client) and **business conflicts** (key client, referral source) that a name search won't surface.
6. **Flag confidentiality overlap.** Identify where acting might require, or risk misuse of, confidential information held from another matter — the basis for an information barrier or a decline.
7. **Spot the obvious conflicts now.** Where the request itself reveals a direct adversity to a known client, surface it immediately rather than waiting for the database run.
8. **Prepare the waiver/consent angle.** Where a conflict may be consentable, note whose informed consent and/or an information barrier would be needed — this is a decision for the responsible lawyer, not an auto-clear.
9. **Score against the Checks table** and output the search brief with a provisional **CLEAR TO SEARCH / POSSIBLE CONFLICT FLAGGED / DIRECT CONFLICT APPARENT** status.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| A party/role omitted | Every party + interested third party listed | S1 | Add the missing party |
| Affiliates / beneficial owners not expanded | Corporate tree + owners + key individuals captured | S1 | Expand each entity |
| Name variants / aliases missing | Trading/former names + spelling variants added | S2 | Generate the variants |
| Only the client side searched | Adverse + interested parties all in the term set | S1 | Add the adverse names |
| Positional / business conflict ignored | Issue + key-client conflicts considered | S2 | Flag non-name conflicts |
| Confidentiality overlap unassessed | Prior-matter info-barrier risk checked | S2 | Flag the overlap |
| Obvious direct conflict not surfaced early | Request screened for known adversity | S1 | Escalate immediately |
| Conflict auto-cleared without the decision-maker | Waiver/consent routed to responsible lawyer | S2 | Do not self-clear; escalate |
| Duplicate/garbled search terms | De-duplicated, grouped term set | S3 | Clean the list |

## Output

Lead with `Status: CLEAR TO SEARCH | POSSIBLE CONFLICT FLAGGED | DIRECT CONFLICT APPARENT — <client v. adverse> — <note>`. Then the output contract. Add:

- **Party map**: each party · role · affiliates/owners/key individuals.
- **Search terms**: the de-duplicated, variant-expanded list grouped by party.
- **Adversity & positional questions**: who is adverse on what; any issue/business conflict.
- **Confidentiality overlap**: prior-matter risks and any info-barrier need.
- One JSON finding per flagged conflict/risk with `category: "conflict-check"`.

## Edge cases & pitfalls

- **Name-only searching**: running the exact legal name without affiliates, owners and variants is how real conflicts slip through — expand first.
- **Forgetting the adverse side**: a conflicts run that only searches the client's own names checks the wrong thing — adverse and interested parties are the point.
- **Invisible positional conflicts**: a database never flags a positional/issue or key-client business conflict — these need human judgement, so surface them for decision.
- **Self-clearing**: treating "no database hit" as clearance ignores consentable conflicts and confidentiality barriers — route the judgement call to the responsible lawyer.
- **Stale entity data**: former names and recent reorganisations are exactly where matches live — chase current and historic names.

## References

- Volatile facts: generally none; conflict rules are professional-conduct rules, cited `[verify current]` where a specific bar's rule governs.
- The applicable professional-conduct conflict rules (e.g. Bar Council of India / SRA / ABA Model Rules as relevant); the firm's conflicts database and engagement records.
