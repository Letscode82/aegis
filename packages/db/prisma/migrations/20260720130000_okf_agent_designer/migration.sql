-- CreateEnum
CREATE TYPE "AgentDefinitionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "KnowledgePackKind" AS ENUM ('CONTRACT_CLAUSES', 'APPROVED_KB', 'POLICY_CORPUS', 'NOTICE_TAXONOMY', 'CONTRACT_TYPE_CATALOG', 'PRIVACY_TRIAGE', 'CLAIMS_LIBRARY', 'TEMPLATE', 'REFERENCE');

-- CreateEnum
CREATE TYPE "KnowledgeItemKind" AS ENUM ('CLAUSE', 'RULE', 'QA', 'TEMPLATE', 'REFERENCE');

-- AlterTable
ALTER TABLE "OrganizationM365Credential" ALTER COLUMN "delegatedScopesGranted" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "icon" TEXT,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "productionReady" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "routingJson" JSONB NOT NULL DEFAULT '{}',
    "modelJson" JSONB NOT NULL DEFAULT '{}',
    "promptJson" JSONB NOT NULL DEFAULT '{}',
    "outputJson" JSONB NOT NULL DEFAULT '{}',
    "risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "playbookJson" JSONB NOT NULL DEFAULT '{}',
    "approverRole" TEXT,
    "status" "AgentDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "draftJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinitionVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "specJson" JSONB NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "changeLog" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDefinitionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePack" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "KnowledgePackKind" NOT NULL DEFAULT 'REFERENCE',
    "agentKey" TEXT,
    "status" "AgentDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePackVersion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "packKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "itemsJson" JSONB NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "changeLog" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgePackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "kind" "KnowledgeItemKind" NOT NULL DEFAULT 'REFERENCE',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL DEFAULT '',
    "dataJson" JSONB NOT NULL DEFAULT '{}',
    "cohortTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCohort" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "selectorJson" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCohort_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDefinition_organizationId_enabled_idx" ON "AgentDefinition"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_organizationId_agentKey_key" ON "AgentDefinition"("organizationId", "agentKey");

-- CreateIndex
CREATE INDEX "AgentDefinitionVersion_organizationId_agentKey_idx" ON "AgentDefinitionVersion"("organizationId", "agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinitionVersion_definitionId_version_key" ON "AgentDefinitionVersion"("definitionId", "version");

-- CreateIndex
CREATE INDEX "KnowledgePack_organizationId_agentKey_idx" ON "KnowledgePack"("organizationId", "agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePack_organizationId_key_key" ON "KnowledgePack"("organizationId", "key");

-- CreateIndex
CREATE INDEX "KnowledgePackVersion_organizationId_packKey_idx" ON "KnowledgePackVersion"("organizationId", "packKey");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePackVersion_packId_version_key" ON "KnowledgePackVersion"("packId", "version");

-- CreateIndex
CREATE INDEX "KnowledgeItem_packId_active_idx" ON "KnowledgeItem"("packId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeItem_packId_code_key" ON "KnowledgeItem"("packId", "code");

-- CreateIndex
CREATE INDEX "KnowledgeCohort_packId_idx" ON "KnowledgeCohort"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCohort_packId_key_key" ON "KnowledgeCohort"("packId", "key");

-- CreateIndex

-- CreateIndex

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinitionVersion" ADD CONSTRAINT "AgentDefinitionVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinitionVersion" ADD CONSTRAINT "AgentDefinitionVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePack" ADD CONSTRAINT "KnowledgePack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePackVersion" ADD CONSTRAINT "KnowledgePackVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePackVersion" ADD CONSTRAINT "KnowledgePackVersion_packId_fkey" FOREIGN KEY ("packId") REFERENCES "KnowledgePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_packId_fkey" FOREIGN KEY ("packId") REFERENCES "KnowledgePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCohort" ADD CONSTRAINT "KnowledgeCohort_packId_fkey" FOREIGN KEY ("packId") REFERENCES "KnowledgePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex

