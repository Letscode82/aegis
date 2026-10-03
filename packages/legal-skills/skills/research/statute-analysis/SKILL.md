---
name: research-statute-analysis
description: >-
  A structured reading of a single statutory or regulatory provision: its scope and trigger, the defined terms, the
  conditions and thresholds, the exceptions and carve-outs, and the legal consequence or penalty — plus how it
  interacts with related provisions and whether it is actually in force. Use to break down what a specific section
  requires before advising on it. Not for the whole research workflow across sources → research/india-legal-research;
  not for comparing jurisdictions → research/multi-jurisdiction-survey.
module: research
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: provision
    required: true
    description: The exact provision to analyse (Act + section/rule number, ideally the verbatim text) and its jurisdiction.
  - name: question
    required: false
    description: The concrete question the analysis must answer (does X trigger this?, what must we do?, is there an exception?) so the reading stays targeted.
  - name: context
    required: false
    description: The facts to apply the provision to, the date (for in-force/amended text), and any official guidance or case-law gloss already held.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [research/india-legal-research, research/multi-jurisdiction-survey, research/source-locked-answering, regulatory/ai-governance, contracts/obligation-extraction]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Statute & Regulation Analysis

Takes one provision and dissects it into its operative parts — scope, definitions, conditions, exceptions, consequence — so advice rests on what the text actually requires rather than a paraphrase. The deliverable is a structured breakdown with the application to the facts and the interaction points flagged, not a restatement of the section.

## When to use / not use

- Use: understanding exactly what a specific section/rule requires before advising; mapping a provision's elements onto a set of facts; finding the exception or threshold that decides the question; extracting the compliance obligation a provision imposes.
- Hand off: the end-to-end research workflow (finding the statute, the case law, good-law checks) → `research/india-legal-research`; comparing the provision across countries → `research/multi-jurisdiction-survey`; answering strictly from supplied text → `research/source-locked-answering`; turning the provision's duties into trackable obligations → `contracts/obligation-extraction`; a regulatory-classification question (e.g. EU AI Act) → `regulatory/ai-governance`.

## Inputs to collect first

1. The **verbatim text** of the provision (Act + section/rule number) — analysis of a paraphrase is worthless.
2. The jurisdiction and the **date** (to confirm the amended, in-force version).
3. The concrete question and the facts to apply it to.
4. Any official definitions clause, guidance, or case-law gloss that controls meaning.

## Method

1. **Confirm the text and that it is in force.** Get the current amended wording and verify the provision (and any amending Act) is actually commenced on the relevant date `[verify current]`.
2. **Identify the scope / trigger.** Who and what the provision applies to — the gateway condition that must be met before anything else bites.
3. **Pin the defined terms.** Read every capitalised/defined term against the definitions clause; a provision's reach is usually decided by a definition elsewhere, not the operative sentence.
4. **Separate conditions from consequences.** List the **cumulative vs alternative** conditions (watch "and" vs "or"), the thresholds/time limits, and then the legal consequence or penalty that follows if they are met.
5. **Find the exceptions and carve-outs.** Provisos, exemptions, de minimis thresholds, and "notwithstanding/subject to" cross-references often decide the outcome — read them before concluding.
6. **Resolve the modal verbs.** Distinguish **shall/must** (mandatory), **may** (discretionary), and **deemed** provisions; mis-reading a "may" as a "must" is a frequent error.
7. **Map interactions.** Note cross-references, overriding clauses ("notwithstanding anything…"), and related provisions that modify or are modified by this one; a section rarely stands alone.
8. **Apply to the facts.** Walk the facts through scope → conditions → exceptions → consequence, stating where the answer turns and where a fact is missing.
9. **Flag ambiguity and authority.** Where the words are unclear, note the competing readings, any binding interpretation, and the preferred view with reasons.
10. **Score against the Checks table** and state the conclusion with the decisive element identified.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Analysed text not current / not in force | Amended, commenced version confirmed for the date | S1 | Re-pull the in-force text `[verify current]` |
| Defined term read in its ordinary sense | Every defined term checked against the definitions | S1 | Apply the statutory definition |
| "and" vs "or" condition logic wrong | Cumulative vs alternative conditions mapped | S1 | Re-parse the conjunctions |
| Exception / proviso overlooked | All provisos, carve-outs, de minimis checked | S1 | Read the exceptions before concluding |
| Mandatory vs discretionary confused | shall/must vs may distinguished | S2 | Correct the modal reading |
| Overriding / cross-reference missed | "Notwithstanding/subject to" links followed | S2 | Trace the interaction |
| Threshold / time limit misstated | Exact numbers and periods quoted | S2 | Quote the figure from the text |
| Facts not applied to the elements | Each element tested against the facts | S2 | Walk the facts element by element |
| Ambiguity resolved without flagging | Competing readings + preferred view stated | S3 | Surface the ambiguity |

## Output

Lead with `Conclusion: <does/does not apply / requires X> — <the decisive element>`. Then the output contract. Add:

- **Scope / trigger**: who and what the provision catches.
- **Elements**: conditions (cumulative/alternative) · thresholds/time limits · exceptions.
- **Consequence**: the duty, right, or penalty that follows.
- **Application**: the facts walked through to the result; missing facts noted.
- **Interactions & ambiguity**: cross-references, overrides, and any unresolved reading.
- One JSON finding per material element or uncertainty with `category: "statute-analysis"`.

## Edge cases & pitfalls

- **The definition decides it**: the operative words may be broad, but a narrow defined term (or a carve-out in the definitions) controls the real scope.
- **Proviso swallows the rule**: a long section with a short proviso often turns on the proviso — read to the end.
- **Unnotified amendment**: the latest text online may not yet be in force; apply the version commenced on the relevant date.
- **"May" that is really "must"**: context or a duty elsewhere can make a discretionary-looking power mandatory — check the structure.
- **Isolated reading**: a "notwithstanding" clause elsewhere can override the provision entirely; never analyse a section in a vacuum.

## References

- Volatile facts: cite `[verify current]` wherever a threshold, time limit, or in-force date in the provision is load-bearing; use the registered `IN-*` / `EU-*` / `US-*` IDs where one covers the provision.
- The verbatim provision + its definitions clause, amending Acts and commencement notifications, official explanatory notes/guidance, and any binding interpretation.
