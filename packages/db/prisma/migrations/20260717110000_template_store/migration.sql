-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('NDA', 'CONTRACT', 'NOTICE', 'OTHER');

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL DEFAULT 'CONTRACT',
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_organizationId_key_key" ON "Template"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Template_organizationId_kind_active_idx" ON "Template"("organizationId", "kind", "active");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
