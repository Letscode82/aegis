-- Retire the legacy contract clause library + draft template tables.
--
-- Both moved into the oKF KnowledgePacks the agents read (one store per
-- agent): the Contracts 📖 Playbook now reads the `contract-clauses`
-- pack (PR #233) and the 📄 Templates screen reads the per-agent
-- `*-template(s)` packs (PR #234). Nothing reads these tables any more.
--
-- The `ContractRisk` and `TemplateKind` enum *types* are intentionally
-- kept: ContractRisk is still used by `ContractClause`, and TemplateKind
-- is still the kind discriminator in the unified template store
-- (modules/contracts templates.ts). Only the tables are dropped.

DROP TABLE IF EXISTS "ClauseLibraryEntry";
DROP TABLE IF EXISTS "Template";

-- The `TemplateKind` enum type is now unused (its only column was on the
-- dropped Template table); the kind discriminator is a plain string union
-- in the unified store. `ContractRisk` is NOT dropped — ContractClause
-- still uses it.
DROP TYPE IF EXISTS "TemplateKind";
