---
name: drafting-legal-translation
description: >-
  Translates legal documents so the legal effect survives, not just the words: render meaning and legal function
  faithfully, keep untranslatable terms-of-art in the original with a note, preserve defined terms/numbering/structure,
  flag concepts with no equivalent in the target legal system, and state which language governs. Use to translate or
  review a translation of a contract, pleading, statute or notice. Not for plain-language rewriting in one language →
  drafting/plain-language-explainer; not for a multi-country legal comparison → research/multi-jurisdiction-survey.
module: drafting
version: 1.0.0
jurisdictions: [global]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of translate (produce the translation + term notes) or review (assess a supplied translation for fidelity of legal effect).
  - name: document
    required: false
    description: The source document, its type (contract, pleading, statute, notice, judgment), the source and target languages, and the target legal system.
  - name: purpose
    required: false
    description: Whether the translation is for understanding, for execution/filing (binding), or certified; and which language will govern.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [drafting/plain-language-explainer, research/multi-jurisdiction-survey, contracts/contract-review, drafting/legal-design-review, research/statute-analysis]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Legal Translation

Takes a legal document and renders it in the target language so its **legal effect** carries over — preserving function, defined terms and structure, flagging concepts with no equivalent, and stating which language governs. The deliverable is a legal-effect-faithful translation (or a review of one) with term notes and the no-equivalent traps flagged, not a literal word swap.

## When to use / not use

- Use: translating a contract, pleading, statute, judgment, or notice between languages; reviewing a supplied legal translation for fidelity of legal effect; producing term notes for a bilingual document.
- Hand off: simplifying a document for a lay reader **in one language** → `drafting/plain-language-explainer`; comparing how different legal systems treat an issue → `research/multi-jurisdiction-survey`; the substantive risk review of the contract being translated → `contracts/contract-review`; improving a document's readability/layout → `drafting/legal-design-review`; close reading of a source statute → `research/statute-analysis`.

## Inputs to collect first

1. The **source document and type** (contract, pleading, statute, notice) — type drives how literal vs functional the translation must be.
2. The **source and target languages** and the **target legal system**.
3. The **purpose**: understanding only, execution/filing (binding), or **certified** translation — this sets the fidelity bar.
4. **Which language governs** — critical where both versions will exist.

## Method

1. **Translate legal function, not words.** Render the legal *effect* each provision has, not a literal gloss; a word-for-word translation of a term of art often produces a clause that means something different (or nothing) in the target system. Fidelity is to meaning and function.
2. **Keep untranslatable terms-of-art in the original + note.** Where a concept has **no equivalent** in the target legal system (e.g. common-law *consideration*, *trust*, *estoppel*; or a civil-law notion in a common-law target), keep the original term and add a translator's note explaining it, rather than forcing a misleading "nearest word".
3. **Flag no-equivalent concepts explicitly.** Surface every place where the legal concepts don't map — these are where a translation silently changes rights. The note/flag is the point; hiding the gap behind a confident translation is the core danger.
4. **Preserve defined terms, numbering and structure.** Keep the defined-terms scheme (translate the definition, keep the term's role), clause numbering, and cross-references intact so the document still operates as a legal instrument.
5. **Match register and precision.** Keep the formality and precision of legal language (shall/must, mandatory vs permissive); don't soften or over-formalise. Preserve deliberate ambiguity where it's deliberate.
6. **Handle numbers, dates, names, citations.** Dates/number formats, currency, party names and addresses, and legal citations converted/retained correctly; a mistranslated figure or date is a substantive error, not a style one.
7. **State the governing-language position.** Where both versions exist, record which language **governs** in a conflict and whether the translation is for convenience or is itself binding; flag any discrepancy found between versions.
8. **Respect certification/formality needs.** For filing/execution, note any requirement for a **certified/sworn** translation, notarisation, or apostille — a translation that's substantively fine can still be rejected for the wrong formality `[verify current]`.
9. **(Review mode)** compare the translation against the source for legal-effect fidelity, missed no-equivalent flags, altered defined terms, and number/date errors.
10. **Score against the Checks table** and output the translation + term notes + no-equivalent flags + governing-language note.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Literal translation distorts legal effect | Function/effect rendered, not word-for-word | S1 | Re-translate for meaning |
| No-equivalent concept forced into a wrong word | Original kept + translator's note | S1 | Keep term; add the note |
| No-equivalent gaps not flagged | Every mismatch surfaced | S1 | Flag the concept gaps |
| Defined terms / numbering / cross-refs broken | Structure + defined-term scheme preserved | S1 | Restore the structure |
| Register/precision lost (shall vs may) | Mandatory/permissive force preserved | S2 | Correct the modal/precision |
| Numbers / dates / names / citations wrong | Converted/retained accurately | S1 | Fix the substantive data |
| Governing language not stated | Which version governs recorded | S2 | Add the governing-language note |
| Certification/formality requirement missed | Certified/sworn/apostille noted where needed | S2 | Flag the formality `[verify current]` |

## Output

Lead with `Translation: <source→target> — <doc type> — fidelity: legal-effect preserved | issues flagged`. Then the output contract. Add:

- **The translation** (or review findings), preserving structure and defined terms.
- **Term notes**: untranslatable terms-of-art kept in original + explanation.
- **No-equivalent flags**: concepts that don't map, and the risk each carries.
- **Governing language & formality**: which version governs; certification needs.
- One JSON finding per fidelity/no-equivalent/data issue with `category: "legal-translation"`.

## Edge cases & pitfalls

- **False-friend terms of art**: translating *consideration*, *trust*, *without prejudice*, or a civil-law concept with its "nearest word" can change the legal meaning entirely — keep the original and note it.
- **Silent concept gaps**: the real danger is a confident translation that hides a concept the target system doesn't have — flag every no-equivalent, loudly.
- **Broken defined terms/cross-refs**: translating a defined term inconsistently, or breaking numbering, stops the document operating as an instrument.
- **Number/date/name slips**: a transposed figure, a misread date format, or a garbled party name is a substantive error with real consequences.
- **Right translation, wrong formality**: a substantively perfect translation can still be rejected for filing without the required certification/sworn status.

## References

- Volatile facts: cite `[verify current]` where a certified/sworn-translation or apostille requirement for the forum is load-bearing.
- Legal-translation practice (functional equivalence, terms of art, governing-language clauses); the source document's defined terms and structure; the target legal system's concepts.
