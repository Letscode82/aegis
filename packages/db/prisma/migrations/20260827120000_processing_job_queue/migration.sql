-- Scale processing queue (Track A / A1). Additive: one new enum + one new
-- table (ProcessingJob) + its indexes and FK. No existing table is touched,
-- so no backfill and no rewrite of prior chain-sealed rows.

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "payloadJson" JSONB NOT NULL,
    "progressJson" JSONB,
    "reviewSetId" TEXT,
    "matterId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "enqueuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessingJob_organizationId_status_idx" ON "ProcessingJob"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_availableAt_priority_idx" ON "ProcessingJob"("status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "ProcessingJob_reviewSetId_idx" ON "ProcessingJob"("reviewSetId");

-- CreateIndex
CREATE INDEX "ProcessingJob_matterId_idx" ON "ProcessingJob"("matterId");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
