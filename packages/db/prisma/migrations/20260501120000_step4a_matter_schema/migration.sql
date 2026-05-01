-- Step 4a — Matter Management schema additions.
--
-- Rationale, in order:
--   1. Enum reshapes — MatterType splits into 9 canonical values; MatterStatus
--      gains DRAFT/STAYED and renames IN_PROGRESS→ACTIVE; MatterPartyRole
--      adds OPS_SUPPORT.
--   2. New enums for MatterTask + MatterFieldTemplate.
--   3. Matter column additions: matterNumber, jurisdiction, estimatedValue,
--      estimatedDurationDays, closeoutChecklistJson, customFieldsJson,
--      m365Bindings.
--   4. AuditLog chain fields (prevHash, contentHash, chainPosition,
--      schemaVersion) and the per-org chain-position unique index. Triggers
--      that *enforce* the chain land in the next migration (4a-audit-chain)
--      so this migration stays purely structural and reversible by Prisma's
--      diff tooling.
--   5. New tables: MatterTask, MatterFieldTemplate, MatterTypeConfig.
--
-- No data is dropped. The IN_PROGRESS rename preserves rows; the new
-- enum values are additive. REGULATORY_INVESTIGATION is repurposed —
-- renamed to INVESTIGATION because the seeded dataset has no matters of
-- that type. (If a future tenant needs to keep the legacy label, add a
-- per-tenant migration that translates back.)

-- ════════════════════════════════════════════════════════════════════
-- 1. Enum reshapes
-- ════════════════════════════════════════════════════════════════════

-- MatterType — split REGULATORY_INVESTIGATION into REGULATORY + INVESTIGATION,
-- and pull M&A out of TRANSACTIONAL.
ALTER TYPE "MatterType" RENAME VALUE 'REGULATORY_INVESTIGATION' TO 'INVESTIGATION';
ALTER TYPE "MatterType" ADD VALUE 'MA' AFTER 'TRANSACTIONAL';
ALTER TYPE "MatterType" ADD VALUE 'REGULATORY' AFTER 'EMPLOYMENT';

-- MatterStatus — DRAFT → OPEN → ACTIVE → STAYED → CLOSED → ARCHIVED.
ALTER TYPE "MatterStatus" RENAME VALUE 'IN_PROGRESS' TO 'ACTIVE';
ALTER TYPE "MatterStatus" ADD VALUE 'DRAFT' BEFORE 'OPEN';
ALTER TYPE "MatterStatus" ADD VALUE 'STAYED' AFTER 'ACTIVE';

-- MatterPartyRole — ops support is a first-class team role.
ALTER TYPE "MatterPartyRole" ADD VALUE 'OPS_SUPPORT' AFTER 'PARALEGAL';

-- ════════════════════════════════════════════════════════════════════
-- 2. New enums
-- ════════════════════════════════════════════════════════════════════

CREATE TYPE "MatterTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

CREATE TYPE "MatterFieldType" AS ENUM ('STRING', 'NUMBER', 'DATE', 'BOOLEAN', 'ENUM', 'CURRENCY');

-- ════════════════════════════════════════════════════════════════════
-- 3. Matter column additions
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "Matter"
  ADD COLUMN "matterNumber"           TEXT,
  ADD COLUMN "jurisdiction"           TEXT,
  ADD COLUMN "estimatedValue"         DECIMAL(18,2),
  ADD COLUMN "estimatedDurationDays"  INTEGER,
  ADD COLUMN "closeoutChecklistJson"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "customFieldsJson"       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "m365Bindings"           JSONB NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX "Matter_organizationId_matterNumber_key"
  ON "Matter"("organizationId", "matterNumber")
  WHERE "matterNumber" IS NOT NULL;

-- Existing seeded rows have status DEFAULT OPEN, but the schema's new
-- default is DRAFT. Existing rows keep their current value (no UPDATE),
-- new rows default to DRAFT. The default is a column-level concern —
-- alter only the column's default, not the data.
ALTER TABLE "Matter" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- ════════════════════════════════════════════════════════════════════
-- 4. AuditLog chain fields
-- ════════════════════════════════════════════════════════════════════
--
-- Columns ship with empty defaults so existing seeded rows are valid.
-- The companion migration (4a-audit-chain) backfills the hashes and
-- positions for legacy rows, then installs triggers to enforce the
-- chain on every subsequent INSERT and to forbid UPDATE / DELETE.

ALTER TABLE "AuditLog"
  ADD COLUMN "prevHash"      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN "contentHash"   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN "chainPosition" BIGINT  NOT NULL DEFAULT 0,
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- Unique-per-org chain position. Excludes the all-zero default so the
-- pre-backfill state doesn't collide; the audit-chain migration drops
-- the partial WHERE once every row is sealed.
CREATE UNIQUE INDEX "AuditLog_organizationId_chainPosition_key"
  ON "AuditLog"("organizationId", "chainPosition")
  WHERE "chainPosition" > 0;

-- ════════════════════════════════════════════════════════════════════
-- 5. New tables — MatterTask, MatterFieldTemplate, MatterTypeConfig
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE "MatterTask" (
  "id"              TEXT             NOT NULL,
  "matterId"        TEXT             NOT NULL,
  "title"           TEXT             NOT NULL,
  "description"     TEXT,
  "assigneeId"      TEXT,
  "dueDate"         TIMESTAMP(3),
  "status"          "MatterTaskStatus" NOT NULL DEFAULT 'PENDING',
  "source"          TEXT             NOT NULL DEFAULT 'manual',
  "closeoutKey"     TEXT,
  "dependsOnTaskId" TEXT,
  "createdBy"       TEXT             NOT NULL,
  "completedAt"     TIMESTAMP(3),
  "completedBy"     TEXT,
  "metadata"        JSONB            NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "MatterTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatterTask_matterId_status_idx"  ON "MatterTask"("matterId", "status");
CREATE INDEX "MatterTask_matterId_dueDate_idx" ON "MatterTask"("matterId", "dueDate");
CREATE INDEX "MatterTask_assigneeId_idx"       ON "MatterTask"("assigneeId");
CREATE INDEX "MatterTask_dependsOnTaskId_idx"  ON "MatterTask"("dependsOnTaskId");

ALTER TABLE "MatterTask"
  ADD CONSTRAINT "MatterTask_matterId_fkey"
  FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatterTask"
  ADD CONSTRAINT "MatterTask_dependsOnTaskId_fkey"
  FOREIGN KEY ("dependsOnTaskId") REFERENCES "MatterTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MatterFieldTemplate" (
  "id"             TEXT              NOT NULL,
  "organizationId" TEXT              NOT NULL,
  "matterType"     "MatterType"      NOT NULL,
  "fieldKey"       TEXT              NOT NULL,
  "fieldLabel"     TEXT              NOT NULL,
  "fieldType"      "MatterFieldType" NOT NULL,
  "isRequired"     BOOLEAN           NOT NULL DEFAULT false,
  "displayOrder"   INTEGER           NOT NULL DEFAULT 0,
  "enumOptions"    JSONB             NOT NULL DEFAULT '[]',
  "helpText"       TEXT,
  "createdAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)      NOT NULL,

  CONSTRAINT "MatterFieldTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatterFieldTemplate_organizationId_matterType_fieldKey_key"
  ON "MatterFieldTemplate"("organizationId", "matterType", "fieldKey");

CREATE INDEX "MatterFieldTemplate_organizationId_matterType_displayOrder_idx"
  ON "MatterFieldTemplate"("organizationId", "matterType", "displayOrder");

CREATE TABLE "MatterTypeConfig" (
  "id"                     TEXT         NOT NULL,
  "organizationId"         TEXT         NOT NULL,
  "matterType"             "MatterType" NOT NULL,
  "numberingFormat"        TEXT         NOT NULL DEFAULT 'M-{YYYY}-{SEQ:4}',
  "numberingSequence"      INTEGER      NOT NULL DEFAULT 0,
  "defaultFolderStructure" JSONB        NOT NULL DEFAULT '[]',
  "closeoutChecklist"      JSONB        NOT NULL DEFAULT '[]',
  "defaultCalendarEvents"  JSONB        NOT NULL DEFAULT '[]',
  "documentTemplates"      JSONB        NOT NULL DEFAULT '[]',
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MatterTypeConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatterTypeConfig_organizationId_matterType_key"
  ON "MatterTypeConfig"("organizationId", "matterType");

CREATE INDEX "MatterTypeConfig_organizationId_idx"
  ON "MatterTypeConfig"("organizationId");
