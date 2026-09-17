-- Privacy program completion (module #10): processor / sub-processor
-- register (#12), cookie & tracker registry (#14), privacy training &
-- awareness tracker (#15). Additive: 6 enums + 3 tables + indexes + FKs.
-- No existing table touched.

-- CreateEnum
CREATE TYPE "ProcessorRole" AS ENUM ('CONTROLLER', 'PROCESSOR', 'SUB_PROCESSOR', 'JOINT_CONTROLLER');

-- CreateEnum
CREATE TYPE "ProcessorDpaStatus" AS ENUM ('NONE', 'REQUESTED', 'SIGNED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProcessorRiskTier" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CookieCategory" AS ENUM ('STRICTLY_NECESSARY', 'FUNCTIONAL', 'ANALYTICS', 'MARKETING');

-- CreateEnum
CREATE TYPE "TrainingCadence" AS ENUM ('ONBOARDING', 'ANNUAL', 'QUARTERLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'OVERDUE');

-- CreateTable
CREATE TABLE "PrivacyProcessor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "ProcessorRole" NOT NULL DEFAULT 'PROCESSOR',
    "purpose" TEXT,
    "location" TEXT,
    "dpaStatus" "ProcessorDpaStatus" NOT NULL DEFAULT 'NONE',
    "riskTier" "ProcessorRiskTier" NOT NULL DEFAULT 'MEDIUM',
    "safeguards" TEXT,
    "contactEmail" TEXT,
    "subProcessors" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyProcessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookieRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CookieCategory" NOT NULL DEFAULT 'FUNCTIONAL',
    "provider" TEXT,
    "purpose" TEXT,
    "domain" TEXT,
    "durationDays" INTEGER,
    "consentRequired" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookieRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyTrainingRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "audience" TEXT,
    "cadence" "TrainingCadence" NOT NULL DEFAULT 'ANNUAL',
    "status" "TrainingStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyTrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyProcessor_organizationId_riskTier_idx" ON "PrivacyProcessor"("organizationId", "riskTier");

-- CreateIndex
CREATE INDEX "PrivacyProcessor_organizationId_dpaStatus_idx" ON "PrivacyProcessor"("organizationId", "dpaStatus");

-- CreateIndex
CREATE INDEX "CookieRecord_organizationId_category_idx" ON "CookieRecord"("organizationId", "category");

-- CreateIndex
CREATE INDEX "PrivacyTrainingRecord_organizationId_status_idx" ON "PrivacyTrainingRecord"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "PrivacyProcessor" ADD CONSTRAINT "PrivacyProcessor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookieRecord" ADD CONSTRAINT "CookieRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyTrainingRecord" ADD CONSTRAINT "PrivacyTrainingRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

