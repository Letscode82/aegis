-- Sanctions-screening reference data (Intake P2b).
--
-- Replaces the hardcoded mockSanctionsCheck with a real, queryable list.
-- GLOBAL (not org-scoped): OFAC SDN / EU / UK consolidated lists are
-- public reference data shared across all tenants. Populated by
-- refreshSanctionsList() from the live Treasury feed in production;
-- seeded with a bootstrap set for demo/CI.

CREATE TABLE "SanctionsListEntry" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "entityType" TEXT,
    "programs" TEXT[],
    "aliasesJson" JSONB NOT NULL DEFAULT '[]',
    "country" TEXT,
    "listedAt" TIMESTAMP(3),
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SanctionsListEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SanctionsListEntry_source_sourceRef_key"
  ON "SanctionsListEntry"("source", "sourceRef");
CREATE INDEX "SanctionsListEntry_normalizedName_idx"
  ON "SanctionsListEntry"("normalizedName");
CREATE INDEX "SanctionsListEntry_source_refreshedAt_idx"
  ON "SanctionsListEntry"("source", "refreshedAt");
