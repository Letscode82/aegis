# Contributing

1. Pick a 🗺️ planned entry in `catalog/catalog.json` (or add one).
2. Copy `templates/SKILL.template.md` to `skills/<module>/<name>/SKILL.md`. Follow `_shared/STANDARDS.md`; use the shared severity scale and output contract.
3. Write from primary sources. Do not paste, translate or closely paraphrase third-party skills or law-firm material (see PROVENANCE.md).
4. Put dates and thresholds in `_shared/volatile-facts.md` and cite the ID; never cite a case you have not verified.
5. Set the catalog entry to `"status": "built"` and run `npm run check`. CI must pass.
6. A lawyer with the relevant expertise reviews every new skill before merge.
