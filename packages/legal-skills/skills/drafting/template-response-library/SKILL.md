---
name: drafting-template-response-library
description: >-
  Builds and maintains a library of approved, reusable responses for recurring legal queries — clustering the real
  question behind repeat asks, drafting a parameterised template with the safe default answer plus the escalate-to-a-
  lawyer boundary, grounding each in an authoritative source, and giving every template an owner and a review date so
  the library stays current. Use to create or curate the canned answers behind a self-service responder or a team's
  FAQ. Not for answering a single live question → intake/self-service-responder; not for drafting an internal policy →
  drafting/policy-drafter.
module: drafting
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of build (create templates from a set of recurring queries) or maintain (review/refresh an existing library — find stale, duplicated, or drifted entries).
  - name: queries
    required: false
    description: The recurring questions (from intake logs, an inbox, a self-service tool) and, for maintain mode, the current library and its last-reviewed dates.
  - name: boundaries
    required: false
    description: Which questions may be answered self-serve vs must route to a lawyer, the house position/source for each topic, and the tone/brand for responses.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [intake/self-service-responder, drafting/policy-drafter, drafting/plain-language-explainer, matters/lessons-learned, research/source-locked-answering]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Response Template Library

Takes a set of recurring legal queries and returns a library of approved, parameterised responses — each with the safe default answer, the escalate-to-a-lawyer boundary, a grounding source, an owner, and a review date. The deliverable is a maintainable template set (or a refresh of one), not a pile of one-off canned replies that rot.

## When to use / not use

- Use: building the approved answers behind a self-service responder or team FAQ; turning repeat intake questions into reusable templates; auditing and refreshing an existing response library for staleness, duplication, or drifted positions.
- Hand off: answering one live question for a requester right now → `intake/self-service-responder`; drafting the underlying internal **policy** the templates reference → `drafting/policy-drafter`; rewriting a template into lay-reader language → `drafting/plain-language-explainer`; capturing lessons that should feed new templates → `matters/lessons-learned`; the strict grounded-answer discipline a template's content must follow → `research/source-locked-answering`.

## Inputs to collect first

1. The **recurring queries** — ideally from intake logs / an inbox / the self-service tool, with volume so high-frequency topics are prioritised.
2. The **boundaries**: which topics are safe to answer self-serve vs must **route to a lawyer** (anything advice-like, fact-specific, or high-stakes).
3. The **house position and authoritative source** for each topic (policy, playbook, statute) so answers are grounded, not invented.
4. For **maintain** mode: the current library and each entry's **last-reviewed date** and usage.

## Method

1. **Cluster to the real question, not the words.** Group repeat asks by the underlying question (ten phrasings of "can I sign this NDA?" are one template). Deduplicate first — a library's value is coverage without redundancy.
2. **Decide answerable-vs-route per cluster.** For each, set whether a template can safely answer it or must hand off to a lawyer. When in doubt, the template's job is to **triage and route**, not to give advice → `intake/self-service-responder`. Never template legal advice on a fact-specific or high-stakes question.
3. **Draft the template parameterised.** Write the safe default answer with explicit **variables** (`{{party}}`, `{{jurisdiction}}`, `{{amount}}`) and conditional branches, so one template serves the cluster rather than spawning near-duplicates.
4. **Ground every answer in a source.** Each template cites the house policy/playbook/authority it rests on → `research/source-locked-answering`; an ungrounded canned answer is how a wrong position scales across the whole org.
5. **Build in the boundary and the escape hatch.** Every template states what it does *not* cover and the clear "talk to Legal / raise a matter" route, so edge cases escalate instead of getting a confidently-wrong canned reply.
6. **Set tone and consistency.** Align voice/brand and keep positions consistent across the library — contradictory templates on adjacent topics erode trust.
7. **Assign owner + review cadence per template.** A template with no owner and no review date is a future wrong answer. Tie topics that depend on volatile facts to the review cycle so they refresh when the law moves `[verify current]`.
8. **(Maintain mode)** find **stale** (past review date / volatile-fact changed), **duplicated**, **drifted** (no longer matches current policy), and **unused** entries; propose merge/refresh/retire with reasons.
9. **Make it findable.** Tag/triage each template so the responder and humans surface the right one; a good answer no one can find is not reused.
10. **Score against the Checks table** and output the template set (or the maintenance report) with owners and review dates.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Duplicates / near-duplicates | Clustered to the real question, deduped | S2 | Merge into one parameterised template |
| Templates legal advice it shouldn't | Answerable-vs-route decided; advice routed | S1 | Convert to triage + route |
| Answer not grounded in a source | Each template cites policy/playbook/authority | S1 | Ground or remove the answer |
| No boundary / escalation route | Scope limit + "talk to Legal" escape stated | S1 | Add the boundary + route |
| Not parameterised | Variables + branches, not hard-coded answers | S2 | Parameterise the template |
| Inconsistent positions across library | Positions consistent + consistent tone | S2 | Reconcile the conflicting templates |
| No owner / review date | Owner + review cadence per template | S1 | Assign owner + review date |
| Volatile fact not tied to review | Volatile-dependent topics flagged + dated | S2 | Link to the review cycle `[verify current]` |
| (Maintain) stale/drifted/unused not found | Stale/dupe/drift/unused surfaced | S2 | Propose merge/refresh/retire |

## Output

Lead with `Template library: <n templates, n routed-not-answered> — top gap: <the one that matters most>` (build) or `Library review: <n stale, n duplicate, n drifted>` (maintain). Then the output contract. Add:

- **Templates**: each with its cluster, the parameterised answer, the source, the boundary/route, owner, and review date.
- **(Maintain)**: the merge/refresh/retire list with reasons.
- **Coverage**: high-frequency questions with no template yet.
- One JSON finding per template or maintenance action with `category: "response-template"`.

## Edge cases & pitfalls

- **Templating advice**: a canned answer to a fact-specific or high-stakes question scales a wrong answer across the org — route it instead.
- **Ungrounded canned answers**: without a cited source, a drifted position propagates silently through every use.
- **No owner, no refresh**: a library with no owners and review dates becomes a bank of out-of-date answers.
- **Near-duplicate sprawl**: separate templates for trivial phrasing differences make the library unmaintainable — cluster and parameterise.
- **Missing escape hatch**: a template with no "this doesn't cover X — talk to Legal" boundary gives confident wrong answers to edge cases.

## References

- Volatile facts: cite `[verify current]` in any template whose answer depends on a date/threshold that changes, and tie it to the review cadence.
- Standard knowledge-management / canned-response practice; the house policies, playbooks and authorities each template rests on; the self-service responder and source-locked-answering disciplines.
