-- Privacy records completion (module #10): retention schedules, cross-border
-- transfer register, AI-system inventory. Additive: 5 enums + 3 tables +
-- indexes + FKs. No existing table touched.

-- CreateEnum
CREATE TYPE "RetentionAction" AS ENUM ('DELETE', 'ANONYMIZE', 'REVIEW');
CREATE TYPE "TransferMechanism" AS ENUM ('SCC', 'ADEQUACY', 'BCR', 'DEROGATION', 'NONE');
CREATE TYPE "TransferStatus" AS ENUM ('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED');
CREATE TYPE "AiSystemRiskTier" AS ENUM ('MINIMAL', 'LIMITED', 'HIGH', 'UNACCEPTABLE');
CREATE TYPE "AiSystemStatus" AS ENUM ('PILOT', 'IN_USE', 'RETIRED');

-- CreateTable
CREATE TABLE "RetentionSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "retentionPeriodDays" INTEGER NOT NULL,
    "action" "RetentionAction" NOT NULL DEFAULT 'DELETE',
    "trigger" TEXT,
    "appliesTo" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataTransfer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "mechanism" "TransferMechanism" NOT NULL DEFAULT 'NONE',
    "status" "TransferStatus" NOT NULL DEFAULT 'ACTIVE',
    "safeguards" TEXT,
    "tiaAssessmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSystem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "riskTier" "AiSystemRiskTier" NOT NULL DEFAULT 'LIMITED',
    "status" "AiSystemStatus" NOT NULL DEFAULT 'PILOT',
    "humanOversight" BOOLEAN NOT NULL DEFAULT true,
    "owner" TEXT,
    "assessmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSystem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionSchedule_organizationId_active_idx" ON "RetentionSchedule"("organizationId", "active");
CREATE INDEX "DataTransfer_organizationId_status_idx" ON "DataTransfer"("organizationId", "status");
CREATE INDEX "AiSystem_organizationId_riskTier_idx" ON "AiSystem"("organizationId", "riskTier");
CREATE INDEX "AiSystem_organizationId_status_idx" ON "AiSystem"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "RetentionSchedule" ADD CONSTRAINT "RetentionSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataTransfer" ADD CONSTRAINT "DataTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSystem" ADD CONSTRAINT "AiSystem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
