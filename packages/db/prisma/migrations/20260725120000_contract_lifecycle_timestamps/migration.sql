-- CLM Phase 1: contract lifecycle timestamps.
-- Additive, nullable — stamped by the guarded status transition
-- (contract-state-machine). No backfill: existing rows keep NULLs until
-- their next transition.
ALTER TABLE "Contract" ADD COLUMN "statusChangedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "executedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "renewedAt" TIMESTAMP(3);
ALTER TABLE "Contract" ADD COLUMN "terminatedAt" TIMESTAMP(3);
