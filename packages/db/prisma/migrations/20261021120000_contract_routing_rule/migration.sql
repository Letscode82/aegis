-- Redesign PR 5 (configurable approval routing): admin-set rules mapping a
-- contract condition (type / perspective / value range) to the approval ladder
-- to run. Additive: one table, no new enum (reuses ContractPerspective), no FK
-- (organizationId + setLadderKey are plain scalars) so the migration is fully
-- localized and cannot be invalidated by a ladder or org edit.

-- CreateTable
CREATE TABLE "ContractRoutingRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "evalOrder" INTEGER NOT NULL DEFAULT 100,
    "matchType" TEXT,
    "matchPerspective" "ContractPerspective",
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "setLadderKey" TEXT NOT NULL,
    "timesFired" INTEGER NOT NULL DEFAULT 0,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractRoutingRule_organizationId_enabled_evalOrder_idx" ON "ContractRoutingRule"("organizationId", "enabled", "evalOrder");
