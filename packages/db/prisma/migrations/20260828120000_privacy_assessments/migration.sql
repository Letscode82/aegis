-- Privacy assessments (module #10 PIA/DPIA engine). Additive: 3 enums + 1
-- table (PrivacyAssessment) + indexes + FK. No existing table touched.

-- CreateEnum
CREATE TYPE "PrivacyAssessmentType" AS ENUM ('PIA', 'DPIA', 'TIA', 'LIA', 'AI', 'VENDOR');

-- CreateEnum
CREATE TYPE "PrivacyAssessmentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrivacyAssessmentRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'SEVERE');

-- CreateTable
CREATE TABLE "PrivacyAssessment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "PrivacyAssessmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PrivacyAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "processingActivityId" TEXT,
    "answersJson" JSONB NOT NULL DEFAULT '[]',
    "riskLevel" "PrivacyAssessmentRisk",
    "riskScore" INTEGER,
    "dpiaRequired" BOOLEAN,
    "mitigationsJson" JSONB NOT NULL DEFAULT '[]',
    "assignedToUserId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyAssessment_organizationId_status_idx" ON "PrivacyAssessment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PrivacyAssessment_organizationId_type_idx" ON "PrivacyAssessment"("organizationId", "type");

-- AddForeignKey
ALTER TABLE "PrivacyAssessment" ADD CONSTRAINT "PrivacyAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
