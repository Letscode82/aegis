# Provenance & Clean-Room Record

This file records how AEGIS Legal Skills was created, so the organisation can show that its content is original and free to use commercially in the AEGIS platform.

## What was looked at

On 2026-10-02 the public repository `github.com/lawve-ai/awesome-legal-skills` was reviewed **for its index only** — the list of categories, skill titles and one-line descriptions — to understand which legal scenarios the community has covered. No skill body, reference file, script or template from that repository was read for drafting, copied, translated or paraphrased.

### Licence findings on the reference repository

| Component | Licence | Consequence for AEGIS |
|---|---|---|
| The curated list / README | CC BY-NC-ND 4.0 | No commercial use and no derivatives. We do not reproduce or adapt the list. |
| Individual skills (≈258) | Mixed: AGPL-3.0 (~44), Apache-2.0 (~45), MIT (~40), CC BY 4.0, proprietary "Lawvable terms", and many with **no licence** | AGPL would impose source-disclosure on a network service; no-licence and proprietary skills are all-rights-reserved. None were used. |

Ideas, scenarios and the general shape of legal workflows (e.g. "triage NDAs", "assess a DPIA") are not protected by copyright; expression is. AEGIS uses only the former.

## How the content was produced

1. **Own taxonomy.** Skills are organised by AEGIS product module (Intake, Contracts, Privacy, Regulatory, Corporate, Disputes, Employment, IP, Outside Counsel, Matters, Research, Drafting, Platform), not by the reference's practice-area headings. The catalog adds scenarios absent from the reference (litigation hold, board pack, obligation extraction, open-source review, Indian commercial enforceability, DPDPA Rules 2025, breach notification across Indian sector regulators, POSH, labour codes, FEMA/FDI, SEBI LODR) and merges duplicates (one AI-governance skill instead of ten AI Act variants; one severity scale instead of three risk assessors).
2. **Independent authoring.** All `SKILL.md`, `references/` and `_shared/` files were written fresh from legal knowledge and primary sources (statutes, gazettes, EUR-Lex, regulator sites). Authors were instructed not to open the reference repository's skills.
3. **Mechanical overlap check.** `scripts/overlap_check.py` compares every AEGIS Markdown file against the full reference repository using 8-word shingles.

### Result of the overlap check (2026-10-02)

- 40 files scanned against 3.77 million reference shingles.
- Highest overlap: 1.01% (`regulatory/ai-governance`). Every shared run in the top files is **statutory or official wording** (e.g. EU AI Act article headings, GDPR Art. 12 "concise, transparent, intelligible and easily accessible form", DPDPA s.6 consent adjectives, Acas Code title). Statutory text is public and not owned by any skill author.
- 0 files over the 2% threshold.

Re-run before each release:

```bash
git clone --depth 1 https://github.com/lawve-ai/awesome-legal-skills /tmp/ref
python scripts/overlap_check.py /tmp/ref
```

## Contributor rule

Contributors must not paste, translate or closely paraphrase third-party skills, law-firm briefings or commercial know-how products. Quote statutes and official guidance freely, with citations. Every PR runs the overlap check in CI if a reference corpus is configured.

*This record is factual documentation, not a legal opinion. Have the organisation's IP counsel confirm the licensing position before external distribution.*
