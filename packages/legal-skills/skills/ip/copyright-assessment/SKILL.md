---
name: ip-copyright-assessment
description: >-
  Assesses a work for copyright: whether it is protectable (originality, idea/expression, fixation), who owns it
  (author vs employer vs commissioner, and the hard question of AI-generated content), and whether a proposed use is
  permitted (licence, fair use / fair dealing, exceptions). Use to check protectability, ownership or a use/clearance
  question. Not for confirming chain of title across a portfolio → ip/ip-ownership-audit; not for open-source licence
  compliance in code → ip/open-source-review.
module: ip
version: 1.0.0
jurisdictions: [global, IN, US]
risk_tier: review-required
inputs:
  - name: mode
    required: true
    description: One of protectability (is there copyright and in what), ownership (who owns it) or use-check (is a proposed use permitted / is this infringement).
  - name: work
    required: false
    description: The work(s) in question — type (text, code, image, music, design, data), how created (human / commissioned / employee / AI-assisted or AI-generated), and when/where.
  - name: use
    required: false
    description: For use-check — the intended use, any licence/permission held, and whether it is commercial, transformative, or a quotation/excerpt.
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md, _shared/volatile-facts.md]
related: [ip/ip-ownership-audit, ip/open-source-review, ip/infringement-takedown, contracts/contract-review, regulatory/ai-governance]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Copyright & Originality Assessment

Takes a work (or a proposed use) and returns whether copyright subsists, who owns it, and whether the use is permitted — with the AI-generated-content and ownership traps handled, not hand-waved. The deliverable is a protectability/ownership/use determination with the risks flagged, not a general copyright explainer.

## When to use / not use

- Use: deciding whether a work is protectable and what exactly is protected; working out ownership (employee/commissioner/AI); assessing whether a proposed use needs a licence or falls within fair use / fair dealing / an exception; a first-pass infringement read.
- Hand off: confirming a clean chain of title across acquired/contributed IP at portfolio scale → `ip/ip-ownership-audit`; open-source-licence obligations in a codebase → `ip/open-source-review`; actually pursuing or responding to infringement/takedown → `ip/infringement-takedown`; the IP-assignment terms in a contract → `contracts/contract-review`; the AI Act/regulatory classification of an AI system → `regulatory/ai-governance`.

## Inputs to collect first

1. The **work type** (text, code, image, music, film, design, compilation/data) and **how it was created** — human, employee, commissioned, or **AI-assisted/AI-generated**.
2. **When and where** created/published (term and applicable law turn on this).
3. For a use-check: the **intended use**, any **licence/permission** held, and whether it's commercial/transformative/an excerpt.

## Method

1. **Protectability — is there copyright, and in what?** Test **originality** (the author's own intellectual creation / skill and judgement), the **idea–expression** divide (ideas, facts, methods aren't protected — only their expression), and **fixation** where required. Identify precisely *what* is protected (the expression, not the underlying concept).
2. **Handle AI-generated content deliberately.** Works with **no human authorship** are, in several jurisdictions (notably the US), **not protectable**; AI-*assisted* works may be protected in the human-authored parts. Flag that ownership/registrability of AI output is unsettled and jurisdiction-specific `[verify current]` — don't assert protection that may not exist.
3. **Ownership — trace it to a person/entity.** Default is the **author**; but **employee** works made in the course of employment usually vest in the **employer**, while **commissioned/contractor** works often stay with the **author absent a written assignment** — the commissioner frequently gets a licence, not ownership. This gap is the most common ownership error `[verify current]`.
4. **Check moral rights and joint authorship.** Moral rights (attribution, integrity) may persist with the author even after assignment; joint works need all owners' consent to license — surface both.
5. **Use-check — licence first.** Is the use covered by a licence/permission (scope, territory, term, sublicensing)? If yes, confirm it reaches this use; if no, move to exceptions.
6. **Assess fair use / fair dealing / exceptions carefully.** These are **jurisdiction-specific and narrow**: US fair use (four-factor, incl. transformativeness and market effect) differs from UK/India **fair dealing** (closed list of purposes) and EU exceptions. Don't assume a US fair-use conclusion travels `[verify current]`.
7. **Flag the infringement test for a use-check.** Access + substantial similarity of protected expression; de minimis and independent creation defences; and database/sui generis rights where relevant.
8. **Score against the Checks table** and set a determination: **PROTECTED / NOT (or thinly) PROTECTED**, **OWNER = X**, and **USE PERMITTED / NEEDS LICENCE / INFRINGING**.

## Checks

| Issue | Good position / test | Default severity | Fallback / action |
|---|---|---|---|
| Protectability assumed without the originality/idea-expression test | Originality + idea/expression + fixation applied | S1 | Run the subsistence test |
| AI-generated work asserted as protected | Human-authorship question flagged per jurisdiction | S1 | Don't assert protection; mark unsettled `[verify current]` |
| Ownership defaulted to the commissioner | Author/employee/commissioner rule applied; written assignment checked | S1 | Trace ownership; get an assignment if needed |
| Moral rights / joint authorship ignored | Moral rights + all-owner consent considered | S2 | Flag the retained rights |
| Use assumed licensed without scope check | Licence scope (use/territory/term) confirmed | S2 | Verify the licence reaches the use |
| Fair use assumed to travel across jurisdictions | Local exception analysed on its own terms | S1 | Re-analyse under the governing law `[verify current]` |
| Idea protected instead of expression | Only expression treated as protected | S2 | Narrow to protected expression |
| Infringement called without the similarity test | Access + substantial similarity assessed | S2 | Apply the infringement test |

## Output

Lead with `Determination: PROTECTED | THINLY/NOT PROTECTED — owner: <X> — use: PERMITTED | NEEDS LICENCE | INFRINGING — <work>`. Then the output contract. Add:

- **Protectability**: what is protected (expression), originality/fixation result, AI-authorship flag.
- **Ownership**: the owner and the basis (author/employee/assignment), moral/joint-rights notes.
- **Use**: licence scope or the exception analysed under the governing law.
- One JSON finding per issue with `category: "copyright"`.

## Edge cases & pitfalls

- **AI output protection**: assuming an AI-generated image/text is owned and protectable can be wrong — human authorship is required in several jurisdictions and the law is unsettled; flag it.
- **Commissioner ≠ owner**: paying for a work (logo, photos, code) does **not** automatically transfer copyright absent a written assignment — the contractor often keeps it.
- **Fair use tourism**: a US transformative-fair-use conclusion does not carry to the UK/India's closed-list fair dealing or EU exceptions — analyse locally.
- **Idea vs expression**: protecting the idea/method rather than its expression over-claims copyright and under-protects — be precise about what's covered.
- **Moral rights survive assignment**: an assignment can leave attribution/integrity rights with the author — don't promise the buyer unfettered rights.

## References

- Volatile facts: cite `[verify current]` on AI-authorship/registrability positions and on jurisdiction-specific fair-use/fair-dealing scope — both are fast-moving.
- The governing copyright statute (e.g. Indian Copyright Act 1957; US Copyright Act / Copyright Office guidance on AI; UK CDPA; EU directives) and the leading originality/fair-use case law.
