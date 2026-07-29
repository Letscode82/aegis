-- CLM Phase 4 (authoring / negotiation): working draft body on Contract.
-- Additive + nullable — existing rows (intake-spawned contracts) keep NULL;
-- their source text remains the originating ticket.
ALTER TABLE "Contract" ADD COLUMN "draftText" TEXT;
