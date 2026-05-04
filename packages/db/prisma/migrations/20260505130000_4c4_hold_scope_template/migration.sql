-- Sub-PR 4c.4: HoldScopeTemplate (hold scope library, Item 12).

CREATE TABLE "HoldScopeTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopeMarkdown" TEXT NOT NULL,
    "defaultJurisdictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultCustodianFiltersJson" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldScopeTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HoldScopeTemplate_organizationId_name_key"
  ON "HoldScopeTemplate"("organizationId", "name");

CREATE INDEX "HoldScopeTemplate_organizationId_idx"
  ON "HoldScopeTemplate"("organizationId");

ALTER TABLE "HoldScopeTemplate"
  ADD CONSTRAINT "HoldScopeTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HoldScopeTemplate"
  ADD CONSTRAINT "HoldScopeTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
