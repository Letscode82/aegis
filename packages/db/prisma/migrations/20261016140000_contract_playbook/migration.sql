-- PR B (structured Playbook): typed, versioned contract playbook — the
-- gradeable position store (Preferred / Fallback / Walk-away + required +
-- guidance + escalation + precedent refs). Additive: three new tables + one
-- enum. No existing table or column changes; no backfill in the migration
-- (the KnowledgeItem -> default-playbook backfill is a separate idempotent
-- seed/data step, so the migration stays deterministic).

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "PlaybookStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "ContractPlaybook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contractType" TEXT,
    "perspective" "ContractPerspective",
    "paperType" TEXT,
    "status" "PlaybookStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "clauseType" TEXT NOT NULL,
    "clauseCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "preferredText" TEXT NOT NULL,
    "fallbackTexts" JSONB NOT NULL DEFAULT '[]',
    "walkAwayText" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "requiredLanguage" TEXT,
    "guidance" TEXT,
    "escalationTrigger" TEXT,
    "precedentRefs" JSONB NOT NULL DEFAULT '[]',
    "severityWeight" INTEGER NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rulesJson" JSONB NOT NULL,
    "note" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractPlaybook_organizationId_status_idx" ON "ContractPlaybook"("organizationId", "status");
CREATE INDEX "ContractPlaybook_organizationId_contractType_idx" ON "ContractPlaybook"("organizationId", "contractType");
CREATE UNIQUE INDEX "PlaybookRule_playbookId_clauseCode_key" ON "PlaybookRule"("playbookId", "clauseCode");
CREATE INDEX "PlaybookRule_organizationId_clauseType_idx" ON "PlaybookRule"("organizationId", "clauseType");
CREATE INDEX "PlaybookRule_playbookId_orderIndex_idx" ON "PlaybookRule"("playbookId", "orderIndex");
CREATE UNIQUE INDEX "PlaybookVersion_playbookId_version_key" ON "PlaybookVersion"("playbookId", "version");
CREATE INDEX "PlaybookVersion_organizationId_playbookId_idx" ON "PlaybookVersion"("organizationId", "playbookId");

-- AddForeignKey
ALTER TABLE "ContractPlaybook" ADD CONSTRAINT "ContractPlaybook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "ContractPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookVersion" ADD CONSTRAINT "PlaybookVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybookVersion" ADD CONSTRAINT "PlaybookVersion_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "ContractPlaybook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
