---
name: research-multi-jurisdiction-survey
description: >-
  Runs the same legal question across several jurisdictions and returns a comparable grid: the position per country,
  the governing instrument, the key divergences, and a confidence/coverage note per cell — built so the rows are
  genuinely comparable rather than a stack of local memos. Use to compare how multiple countries treat one issue.
  Not for a single-country deep dive → research/statute-analysis or research/india-legal-research; not for a
  cross-border personal-data transfer mechanism → privacy/cross-border-transfer.
module: research
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: question
    required: true
    description: The precise legal question to ask of every jurisdiction, framed so it maps onto each system (not assuming one country's categories).
  - name: jurisdictions
    required: true
    description: The list of countries/states to cover, and which is the home/benchmark jurisdiction if there is one.
  - name: depth
    required: false
    description: How deep each cell must go (headline yes/no, the rule + key conditions, or a reasoned position) and the deadline/coverage expected.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [research/statute-analysis, research/india-legal-research, research/source-locked-answering, privacy/cross-border-transfer, regulatory/competition-merger-control]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Multi-Jurisdiction Survey

Takes one question and a list of countries and returns a comparison grid whose rows are actually comparable: the same sub-questions asked of each jurisdiction, the local answer and its source, the divergences surfaced, and each cell's confidence flagged. The deliverable is a decision-ready comparison, not a pile of local summaries in different shapes.

## When to use / not use

- Use: comparing how several jurisdictions treat one issue (enforceability of a clause, a regulatory threshold, a statutory right); building a country matrix to decide where to act or how to standardise; scoping a cross-border rollout.
- Hand off: a deep single-provision reading → `research/statute-analysis`; an India-only question → `research/india-legal-research`; answering strictly from a fixed brief with no outside authority → `research/source-locked-answering`; the mechanism for moving personal data across borders → `privacy/cross-border-transfer`; a merger-filing multi-jurisdiction threshold check (which has its own screening logic) → `regulatory/competition-merger-control`.

## Inputs to collect first

1. The **precise question**, framed neutrally so it maps onto each legal system rather than importing one country's categories.
2. The **jurisdiction list** and the benchmark/home country if the comparison is against one.
3. The **sub-questions** (the columns) that every cell must answer — fixing these first is what makes the grid comparable.
4. The required depth and the local-law coverage available (and whether local counsel input is needed for any cell).

## Method

1. **Fix the columns before filling any cell.** Decompose the question into a small set of sub-questions every jurisdiction answers (e.g. *is it permitted? / threshold / conditions / penalty / is local-law confirmation needed?*). Inconsistent columns are what turn a survey into noise.
2. **Frame the question to travel.** Strip home-jurisdiction assumptions; ask in functional terms ("does the law restrict X?") so a country with a different doctrinal route still has a place to answer.
3. **Answer each jurisdiction against the same columns**, citing the governing instrument per cell. Use the per-jurisdiction discipline of `research/statute-analysis` within each cell; don't let one country's answer balloon and distort the grid.
4. **Flag coverage and confidence per cell.** Mark where the answer is from primary law, from secondary sources, or **needs local-counsel confirmation** — a confident-looking grid that hides thin cells is dangerous.
5. **Surface the divergences explicitly.** A separate "key differences" read: where jurisdictions split, the outliers, and the practical consequence — this is usually the real deliverable, not the cells themselves.
6. **Note the as-of date and volatility.** Comparative law goes stale unevenly; date the survey and flag cells resting on pending or recently-changed law `[verify current]`.
7. **Do not over-synthesise.** Where countries genuinely differ, say so; forcing a false "broadly similar" conclusion to tidy the grid misleads the decision.
8. **Score against the Checks table** and present the grid + divergences + a short "so what" for the decision.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Columns differ across cells | One fixed sub-question set applied to all | S1 | Re-grid against common columns |
| Question imports home-jurisdiction assumptions | Framed functionally to map onto each system | S2 | Re-frame neutrally |
| Cell uncited | Governing instrument cited per cell | S2 | Add the source or mark unsupported |
| Thin cell shown as confident | Coverage/confidence flagged per cell | S1 | Mark "needs local-counsel confirmation" |
| Divergences buried in the grid | Key differences surfaced separately | S2 | Add the divergence read |
| Survey undated / volatility ignored | As-of date + pending-law flags | S2 | Date it; flag volatile cells `[verify current]` |
| False "broadly similar" synthesis | Real differences stated plainly | S2 | Correct the synthesis |
| One country's cell distorts the grid | Comparable depth across cells | S3 | Trim to the common depth |

## Output

Lead with `Survey: <question> across <n> jurisdictions — headline: <the key divergence or common position>`. Then the output contract. Add:

- **Comparison grid**: jurisdiction × sub-questions, each cell with its source and a confidence flag.
- **Key divergences**: where countries split and the practical consequence.
- **Coverage notes**: cells needing local-counsel confirmation; as-of date.
- One JSON finding per material divergence or low-confidence cell with `category: "multi-jurisdiction"`.

## Edge cases & pitfalls

- **Column drift**: the single most common failure is cells answering slightly different questions — lock the columns first.
- **Home-jurisdiction blinkers**: asking the question in one country's doctrinal terms leaves systems with a different route looking like "no law", when they regulate it differently.
- **False tidiness**: flattening genuine divergence into "broadly similar" to make the grid look clean is the error that burns the client in the outlier country.
- **Uneven staleness**: one jurisdiction may have changed the law last month; an undated grid hides it — date and flag.
- **Over-reliance on secondary sources**: a neat English-language summary of a foreign law may be out of date or wrong — flag cells that need local confirmation.

## References

- Volatile facts: `IN-CCI-01`, `EU-GDPR-01`, `EU-AIA-01..04` and other registered IDs where a surveyed cell rests on them; cite `[verify current]` on any volatile or pending cell.
- Per-jurisdiction primary law and reputable comparative sources; local-counsel input for cells where the stakes justify it.
