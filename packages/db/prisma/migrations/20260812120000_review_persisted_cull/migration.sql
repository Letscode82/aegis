-- RC-5: persisted culls + exclusion log. Additive.
ALTER TABLE "ReviewSetItem"
    ADD COLUMN "excludedAt"      TIMESTAMP(3),
    ADD COLUMN "exclusionReason" TEXT;

CREATE INDEX "ReviewSetItem_reviewSetId_excludedAt_idx" ON "ReviewSetItem"("reviewSetId", "excludedAt");
