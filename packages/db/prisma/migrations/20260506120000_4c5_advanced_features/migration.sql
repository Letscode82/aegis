-- Sub-PR 4c.5: defensibility snapshots + saved views + notice
-- template version history.

-- ── HoldDefensibilityScoreSnapshot (Item 15) ──────────────────────
CREATE TABLE "HoldDefensibilityScoreSnapshot" (
    "id" TEXT NOT NULL,
    "legalHoldId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "componentsJson" JSONB NOT NULL,
    "gapCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HoldDefensibilityScoreSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HoldDefensibilityScoreSnapshot_legalHoldId_computedAt_idx"
  ON "HoldDefensibilityScoreSnapshot"("legalHoldId", "computedAt");
ALTER TABLE "HoldDefensibilityScoreSnapshot"
  ADD CONSTRAINT "HoldDefensibilityScoreSnapshot_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── SavedView (Item 16) ───────────────────────────────────────────
CREATE TYPE "SavedViewScope" AS ENUM (
  'LEGAL_HOLD_CUSTODIANS',
  'LEGAL_HOLDS_LIST',
  'MATTER_LIST',
  'AUDIT_LOG'
);

CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scope" "SavedViewScope" NOT NULL,
    "name" TEXT NOT NULL,
    "filterStateJson" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SavedView_organizationId_scope_ownerId_idx"
  ON "SavedView"("organizationId", "scope", "ownerId");
CREATE INDEX "SavedView_organizationId_scope_isShared_idx"
  ON "SavedView"("organizationId", "scope", "isShared");
ALTER TABLE "SavedView"
  ADD CONSTRAINT "SavedView_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedView"
  ADD CONSTRAINT "SavedView_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── HoldNoticeTemplateVersion (Item 17) ───────────────────────────
CREATE TABLE "HoldNoticeTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "changeLog" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HoldNoticeTemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HoldNoticeTemplateVersion_templateId_version_key"
  ON "HoldNoticeTemplateVersion"("templateId", "version");
CREATE INDEX "HoldNoticeTemplateVersion_templateId_createdAt_idx"
  ON "HoldNoticeTemplateVersion"("templateId", "createdAt");
ALTER TABLE "HoldNoticeTemplateVersion"
  ADD CONSTRAINT "HoldNoticeTemplateVersion_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "HoldNoticeTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HoldNoticeTemplateVersion"
  ADD CONSTRAINT "HoldNoticeTemplateVersion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
