-- Date-window culling + chronology: capture the item date on ReviewSetItem.
-- Additive, nullable — no backfill needed (existing rows stay null / undated).
ALTER TABLE "ReviewSetItem" ADD COLUMN "sentAt" TIMESTAMP(3);
CREATE INDEX "ReviewSetItem_reviewSetId_sentAt_idx" ON "ReviewSetItem"("reviewSetId", "sentAt");
