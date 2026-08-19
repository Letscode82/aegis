-- Reviewer-parity v3: batching, reviewer assignment, and a second-level QC
-- pass. Additive.
ALTER TABLE "ReviewSetItem"
    ADD COLUMN "batchId"          TEXT,
    ADD COLUMN "assignedToUserId" TEXT,
    ADD COLUMN "qcStatus"         TEXT,
    ADD COLUMN "qcById"           TEXT;

CREATE TABLE "ReviewBatch" (
    "id"               TEXT NOT NULL,
    "organizationId"   TEXT NOT NULL,
    "reviewSetId"      TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "status"           TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById"      TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewBatch_organizationId_reviewSetId_idx" ON "ReviewBatch"("organizationId", "reviewSetId");
CREATE INDEX "ReviewSetItem_reviewSetId_batchId_idx" ON "ReviewSetItem"("reviewSetId", "batchId");

ALTER TABLE "ReviewBatch"
    ADD CONSTRAINT "ReviewBatch_reviewSetId_fkey"
    FOREIGN KEY ("reviewSetId") REFERENCES "ReviewSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
