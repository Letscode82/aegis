---
name: drafting-legal-design-review
description: >-
  Scores and improves a legal document's readability and usability: structure and navigation (headings, order,
  summaries), language (plain, consistent, defined terms), visual layout (whitespace, tables, numbering), and
  usability for its actual reader and task — without changing legal effect. Use to make a contract, policy, notice or
  form easier to understand and act on. Not for simplifying content into a lay explainer → drafting/plain-language-
  explainer; not for persuasive advocacy structure → drafting/persuasive-writing.
module: drafting
version: 1.0.0
jurisdictions: [global]
risk_tier: self-serve
inputs:
  - name: mode
    required: true
    description: One of review (score + recommend improvements) or redesign (produce an improved version preserving legal effect).
  - name: document
    required: false
    description: The document and its type (contract, policy, notice, consent form, disclosure), the audience, and the task the reader must perform with it.
  - name: constraints
    required: false
    description: Any mandatory content/format the law requires, brand/style rules, and the channel (print, web, mobile).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [drafting/plain-language-explainer, drafting/persuasive-writing, contracts/terms-of-service-audit, regulatory/accessibility-compliance, privacy/privacy-notice-drafter]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Legal Design Review

Takes a legal document and returns a usability assessment and concrete improvements — structure, language, layout — so its actual reader can understand it and do what it asks, **without changing the legal effect**. The deliverable is a scored review (or a redesigned version) with specific fixes, not a vague "make it clearer".

## When to use / not use

- Use: making a contract, policy, notice, consent form, or disclosure easier to read and act on; scoring a document's usability; redesigning a dense legal document for its real audience and channel; checking a form actually gets completed correctly.
- Hand off: rewriting content into a lay-reader explanation (changing what's said, not just how) → `drafting/plain-language-explainer`; structuring a persuasive brief/submission → `drafting/persuasive-writing`; the legal/consumer-law audit of online terms → `contracts/terms-of-service-audit`; accessibility/WCAG conformance for a digital product → `regulatory/accessibility-compliance`; the privacy-notice content itself → `privacy/privacy-notice-drafter`.

## Inputs to collect first

1. The **document and type**, the **audience** (lawyer, consumer, employee, counterparty), and the **task** the reader must perform (sign, decide, comply, complete).
2. Any **mandatory content/format** the law requires (which can't be designed away).
3. **Brand/style** rules and the **channel** (print, web, mobile).

## Method

1. **Anchor on the reader and the task.** Who reads this and what must they *do* with it? Usability is measured against that task — a consumer consent form and a bilateral MSA have different bars. Design for the actual reader, not the drafter.
2. **Review structure and navigation.** Logical order (most-important/most-used first), meaningful **headings**, a summary or table of key terms where the document is long, and findable cross-referenced content — can the reader locate the clause that governs their question?
3. **Review language.** Plain words over legalese where legal effect allows, short sentences, active voice, consistent terminology, and defined terms used (not drifted). Keep the precision the law needs — clarity is not dumbing down.
4. **Review visual layout.** Whitespace, consistent numbering, tables for conditional/comparative content (fees, timelines, who-does-what), emphasis for critical terms, and no walls of dense text. Layout does real comprehension work.
5. **Preserve legal effect — the hard constraint.** Every design change must leave the legal meaning intact; don't drop a clause, soften a mandatory term, or merge provisions in a way that changes rights. Flag anywhere a usability fix would touch substance so a lawyer signs it off.
6. **Respect mandatory form.** Some content/format/prominence is legally required (consumer disclosures, prescribed wording, signature blocks) — design within it, and use prominence to satisfy "clear and conspicuous" rules rather than fight them `[verify current]`.
7. **Design for the channel and accessibility.** Mobile/web rendering, reflow, and basic accessibility (headings, contrast, structure) so the document works where it's actually used → `regulatory/accessibility-compliance`.
8. **Test against the task.** Where possible, sanity-check that a target reader could find the key term and complete the action; for forms, that the fields map to what the reader knows.
9. **Score against the Checks table** and output a usability score + prioritised fixes (or the redesigned document with a note on anything needing legal sign-off).

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Not designed for the actual reader/task | Audience + task identified and targeted | S2 | Re-anchor on reader/task |
| Poor structure / no navigation | Logical order + headings + summary/key-terms | S2 | Restructure + add navigation |
| Legalese / inconsistent terms | Plain, consistent language; defined terms used | S2 | Simplify where effect allows |
| Dense layout / no visual aids | Whitespace + tables + emphasis on critical terms | S2 | Improve the layout |
| Design change alters legal effect | Meaning preserved; substance changes flagged | S1 | Flag for legal sign-off; don't change silently |
| Mandatory form/prominence not respected | Required content/format/prominence kept | S1 | Design within the requirement `[verify current]` |
| Breaks on mobile / inaccessible | Channel + basic accessibility handled | S2 | Fix rendering/accessibility |
| Not tested against the task | Reader can find key term / complete action | S3 | Sanity-check the task |

## Output

Lead with `Usability: <score/band> — <document> — top fix: <the highest-impact change>`. Then the output contract. Add:

- **Reader & task**: who it's for and what they must do.
- **Findings**: structure / language / layout issues, each with a concrete fix.
- **Legal-effect note**: any fix that touches substance and needs sign-off.
- **(Redesign mode)** the improved document.
- One JSON finding per usability issue with `category: "legal-design"`.

## Edge cases & pitfalls

- **Clarity that changes the law**: the cardinal error — a "simplification" that drops a carve-out or softens a mandatory term alters rights; preserve legal effect and flag anything substantive for sign-off.
- **Designing away mandatory content**: prescribed wording, disclosures, and prominence rules can't be tidied out — design *within* them, using layout to satisfy "clear and conspicuous".
- **Dumbing down ≠ clarity**: stripping necessary precision to read nicely creates ambiguity — keep the precision the document needs.
- **Pretty but unusable**: visual polish that doesn't help the reader find or do the thing misses the point — measure against the task.
- **Desktop-only design**: a layout that collapses on mobile fails where many readers actually open it — design for the channel.

## References

- Volatile facts: cite `[verify current]` where a "clear and conspicuous"/prescribed-format legal requirement governs the document.
- Legal-design and plain-language practice (information hierarchy, layering, visualisation); any mandatory-content/format rules for the document type; accessibility basics → `regulatory/accessibility-compliance`.
