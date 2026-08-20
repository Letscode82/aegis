-- AIR-4: pilot → validate → scale runs over a review set. Additive.

ALTER TABLE "ReviewSetItem" ADD COLUMN "pilotRunId" TEXT;
CREATE INDEX "ReviewSetItem_pilotRunId_idx" ON "ReviewSetItem"("pilotRunId");

CREATE TABLE "ReviewValidationRun" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "reviewSetId"     TEXT NOT NULL,
    "profileId"       TEXT,
    "profileVersion"  INTEGER,
    "dimension"       TEXT NOT NULL DEFAULT 'RESPONSIVE',
    "status"          TEXT NOT NULL DEFAULT 'AWAITING_CODING',
    "sampleSize"      INTEGER NOT NULL,
    "metricsJson"     JSONB,
    "scaledAt"        TIMESTAMP(3),
    "appliedCount"    INTEGER,
    "failClosedCount" INTEGER,
    "createdById"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewValidationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewValidationRun_organizationId_reviewSetId_idx" ON "ReviewValidationRun"("organizationId", "reviewSetId");
ALTER TABLE "ReviewValidationRun"
    ADD CONSTRAINT "ReviewValidationRun_reviewSetId_fkey"
    FOREIGN KEY ("reviewSetId") REFERENCES "ReviewSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
