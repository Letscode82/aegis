-- PR A (guided Create): record which side a contract is drafted/negotiated for.
-- Distinct from `origin` (whose template it started on). Additive and nullable
-- so every pre-existing Contract row keeps a null perspective — no backfill,
-- no data rewrite, deterministic given the same starting state.

-- CreateEnum (idempotent — safe on a re-applied database)
DO $$ BEGIN
  CREATE TYPE "ContractPerspective" AS ENUM ('OUR_SIDE', 'THEIR_SIDE', 'MUTUAL', 'NEUTRAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddColumn
ALTER TABLE "Contract" ADD COLUMN "perspective" "ContractPerspective";
