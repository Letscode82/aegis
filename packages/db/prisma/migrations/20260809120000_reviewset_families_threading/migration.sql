-- Reviewer-parity v2: document families, email threading, near-dup. Additive.
ALTER TABLE "ReviewSetItem"
    ADD COLUMN "familyId"    TEXT,
    ADD COLUMN "familyRole"  TEXT,
    ADD COLUMN "threadId"    TEXT,
    ADD COLUMN "isInclusive" BOOLEAN,
    ADD COLUMN "dedupKey"    TEXT;

CREATE INDEX "ReviewSetItem_reviewSetId_threadId_idx" ON "ReviewSetItem"("reviewSetId", "threadId");
CREATE INDEX "ReviewSetItem_reviewSetId_familyId_idx" ON "ReviewSetItem"("reviewSetId", "familyId");
