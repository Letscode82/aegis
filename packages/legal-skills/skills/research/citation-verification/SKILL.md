---
name: research-citation-verification
description: >-
  Checks every cited authority in a draft for existence, correct citation, whether it actually supports the
  proposition, subsequent history (still good law) and pinpoint accuracy, and flags likely AI hallucinations. Use
  before any memo, brief, opinion, board paper or letter leaves Legal, when outside counsel or an AI tool supplied
  citations, or someone asks "is this case real / still good law". Not for answering the underlying question →
  research/legal-research-memo.
module: research
version: 1.0.0
jurisdictions: [global, IN, UK, US, EU]
risk_tier: review-required
inputs:
  - name: document
    required: true
    description: The draft containing citations (memo, brief, submission, letter, board paper, AI output).
  - name: source_access
    required: false
    description: Which databases or official sites are available in this run (e.g. SCC Online, Manupatra, Indian Kanoon, court websites, BAILII, National Archives, EUR-Lex, CourtListener, Westlaw/Lexis).
  - name: forum
    required: false
    description: Court or tribunal the document is going to, which sets citation style and which authorities bind.
  - name: priority
    required: false
    description: all (default) | load-bearing-only (authorities on which a conclusion depends).
outputs: [markdown, json]
depends_on: [_shared/STANDARDS.md, _shared/severity-scale.md, _shared/output-contract.md]
related: [research/legal-research-memo, research/india-legal-research, research/statute-analysis, drafting/persuasive-writing, platform/ai-work-audit-trail, disputes/adversarial-stress-test]
last_reviewed: 2026-10-02
license: Apache-2.0
---

# Citation Verification

Courts in several jurisdictions have sanctioned lawyers for filing AI-generated authorities that do not exist, and real cases cited for propositions they do not contain are just as damaging. This skill treats every citation as unverified until proved, checks it against a primary or authoritative source available in this run, and returns a table the author can act on line by line. If a citation cannot be checked, it is reported as **unverifiable here** — never "probably fine".

## When to use / not use

- Use for: any outbound document with authorities; outside counsel drafts; AI-assisted drafts; opposing party submissions (to find weaknesses); citations quoted in regulator correspondence.
- Hand off: finding *replacement* authority or answering the question → `research/legal-research-memo` / `research/india-legal-research`; reading a statutory provision closely → `research/statute-analysis`; logging AI use and checks → `platform/ai-work-audit-trail`.

## Inputs to collect first

1. The document and the **forum** (binding hierarchy and required citation style differ).
2. Which **sources** you can actually query this run. If you have no live access, say so up front: you can then only check internal consistency and red flags, and every result is `UNVERIFIABLE`.
3. Whether to check every citation or only load-bearing ones (default: all).

## Method

1. **Extract** every authority: cases, statutes and sections, rules, regulations, circulars, treaties, secondary sources, and quotations attributed to them. Record the proposition each is cited for (quote ≤25 words from the draft) and the pinpoint given.
2. **Classify load**: *load-bearing* (conclusion depends on it), *supporting*, or *background*.
3. **Existence check**: locate the authority in an official or authoritative source (court website, official reporter, Gazette, legislation database, EUR-Lex). Confirm parties, court, date, citation, and — for neutral citations — that the number resolves to this judgment.
4. **Accuracy check**: read the relevant passage. Does it state the proposition? Classify as *supports*, *partially supports* (narrower, conditional, different facts), *obiter only*, *dissent/minority*, *does not support*, or *contradicts*.
5. **Quotation check**: quoted words appear verbatim at the pinpoint; ellipses do not change meaning.
6. **Pinpoint check**: paragraph/page exists and contains the point. Indian judgments: paragraph numbers differ across reporters — state which reporter's paragraphing is used.
7. **Subsequent history / treatment**: appealed, reversed, overruled, doubted, referred to a larger bench, distinguished on point, or statute amended/repealed/renumbered (e.g. IPC → BNS; Companies Act 1956 → 2013; Income-tax Act 1961 → 2025). Mark the date checked.
8. **Status** each citation:
   - **VERIFIED** — exists, supports, good law, pinpoint correct.
   - **CORRECTABLE** — exists and supports, but citation, pinpoint, party name, year or quotation needs a fix (give the fix).
   - **MISCHARACTERISED** — exists but does not support the proposition as stated.
   - **BAD LAW** — reversed, overruled, or provision repealed/amended so it no longer applies.
   - **NOT FOUND** — could not be located in sources that should contain it; treat as potentially fabricated.
   - **UNVERIFIABLE** — no access to a source that would contain it in this run.
9. **Score**: NOT FOUND or MISCHARACTERISED on a load-bearing authority in a filing or opinion = **S1** (stop: do not file/send). BAD LAW load-bearing = S1; supporting = S2. CORRECTABLE = S4 (S3 if a quotation is wrong). UNVERIFIABLE load-bearing = S2 until checked.

## Hallucination red flags

Raise suspicion (not a conclusion) when any of these appear; then search harder before marking NOT FOUND:

| Red flag | Why it matters |
|---|---|
| Party names that are generic or "too apt" for the proposition | Fabricated cases often have plausible but invented names |
| Reporter volume/page that does not exist for that year, or a reporter that did not exist then | Structural impossibility |
| Neutral citation year inconsistent with the decision date, or a number beyond that court's annual range | Format check fails |
| Court that could not have decided it (e.g. a High Court citation in an SC reporter series; a UKSC citation dated before 2009) | Institutional impossibility |
| Quotations that read like a textbook summary of the proposition | Real judgments rarely state the exact proposition in the drafter's words |
| Same case cited with different years/citations across the document | Inconsistency |
| Statute section that does not exist or has different subject matter | Fabricated or renumbered |
| No paragraph pinpoint for a key proposition | Hard to verify; often a sign the author never read it |
| Authority unknown to any database available but "described in detail" | Strong indicator |

## Citation format checks

| System | Correct form (format examples) | Notes |
|---|---|---|
| India — SCC | `(2017) 10 SCC 1` — (year) volume SCC page | Year in round brackets; para pinpoints `at para 45` |
| India — AIR | `AIR 1973 SC 1461` | Court abbreviation after year; High Courts e.g. `AIR 1990 Bom 1` |
| India — SCC OnLine | `2023 SCC OnLine SC 123`; `2023 SCC OnLine Del 456` | Often the first reported source; check it is the final judgment, not an interim order |
| India — SC neutral citation | `2023 INSC 123` | Introduced by the Supreme Court in 2023, including retrospective assignment for earlier judgments `[verify current]` |
| India — HC neutral citation | Formats vary by High Court (e.g. `2023:DHC:1234`) | Check the High Court's own format notice |
| India — statutes | Name, year, section: `Indian Contract Act, 1872, s. 27` | Give old and new section numbers across the 2024 criminal code change |
| UK — neutral | `[2019] UKSC 41`; `[2020] EWCA Civ 1`; `[2021] EWHC 123 (Comm)` | Neutral citation preferred; reports in square brackets for year-volume series |
| UK — reports | `[1932] AC 562`; `[2015] 1 WLR 123` | Law Reports take precedence over other series |
| US — federal | `347 U.S. 483 (1954)`; `F.3d`, `F.4th`, `F. Supp. 3d` with court and year | Bluebook; parallel cites for state courts per local rule |
| EU — CJEU | Case number + ECLI, e.g. `C-131/12, ECLI:EU:C:2014:317` | ECLI is the reliable identifier; check Opinion of the AG vs judgment |
| EU — legislation | `Regulation (EU) 2016/679, Art. 33(1)` | Use the consolidated text; note later amendments |

(Examples illustrate format; they are not cited for any proposition.)

## India-specific checks

- Larger-bench rule: a decision of a larger bench prevails; coordinate-bench conflicts require reference. Check whether a cited SC case has been referred to a larger bench (pending reference = S3 caution).
- Interim orders vs final judgments: SCC OnLine and court sites publish both; an interim order is rarely authority.
- Reporter paragraphing: SCC, AIR and court-site PDFs number paragraphs differently; pinpoint to the version cited.
- Repealed statutes: IPC/CrPC/Evidence Act (from 1 July 2024), Companies Act 1956, Income-tax Act 1961 (from 1 April 2026) — citation may be correct for past conduct; say so.
- Tribunal orders (NCLT, NCLAT, SAT, CESTAT, ITAT) are not binding on High Courts; label weight.

## Other jurisdictions

- **UK**: court guidance on citing authorities (Practice Direction on citation of authorities, 2012) limits which judgments may be cited `[verify current]`; check that the judgment is "approved" not a draft.
- **US**: unpublished opinions carry limited precedential value and have citation rules by circuit (FRAP 32.1 permits citing those issued on or after 1 Jan 2007) `[verify current]`. Check for negative treatment via a citator.
- **AI-generated filings**: several courts require certification that AI-assisted citations were checked; check the forum's standing orders `[verify current]`.

## Output

Lead with `Verdict: CLEAR TO SEND | FIX THEN SEND | DO NOT SEND — <n> load-bearing problems`. Follow `_shared/output-contract.md` (category `citation`). Add a **Verification table** between Findings and Actions:

| # | Citation as written | Proposition (draft) | Load | Status | Source checked & date | Correction / note |
|---|---|---|---|---|---|---|

In JSON, each citation is a finding with `authority[].verified` true only if checked against a source in this run. Overall: any S1 → `DO NOT SEND`.

## Edge cases & pitfalls

- Never "fix" a NOT FOUND citation by substituting a similar-sounding real case; report it and send the author to research.
- A case found only in a secondary article is not verified.
- Same name, different case: check court, date and parties (common names, e.g. "Union of India" or "State of X", produce many matches).
- Translated judgments: verify against the authoritative language version; flag translation differences.
- If the draft cites your own organisation's earlier memo for a legal proposition, trace it to the primary authority.
- Do not mark VERIFIED on the strength of the model's memory; memory is `[unverified]` by rule (STANDARDS §3).
