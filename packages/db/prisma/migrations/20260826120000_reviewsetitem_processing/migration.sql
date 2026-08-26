-- PROC-5/8/9 wiring: capture per-item processing signals at collection.
-- Additive, all nullable — no backfill needed (existing rows stay null).
ALTER TABLE "ReviewSetItem" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "ReviewSetItem" ADD COLUMN "language" TEXT;
ALTER TABLE "ReviewSetItem" ADD COLUMN "processingException" TEXT;
CREATE INDEX "ReviewSetItem_reviewSetId_contentHash_idx" ON "ReviewSetItem"("reviewSetId", "contentHash");
