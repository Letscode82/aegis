-- ════════════════════════════════════════════════════════════════════
-- Sub-PR 4b — Legal Hold core.
-- ════════════════════════════════════════════════════════════════════
--
-- Reshape Legal Hold from a 4a placeholder into the event-sourced,
-- jurisdiction-aware lifecycle described in CLAUDE.md "Architectural
-- Foundations: Legal Hold lifecycle as event log".
--
-- Old tables (HoldNotice, HoldAttestation, PreservationOrder) plus the
-- PreservationDataSource enum are replaced by LegalHoldCustodian +
-- CustodianDataSource + HoldNoticeIssuance / HoldNoticeTemplate. Old
-- LegalHold rows are deleted — they're demo-seed data and the new
-- schema requires fields that have no plausible backfill (createdById,
-- holdNumber, title). The seed (§3-Legal Hold) is rebuilt to populate
-- everything correctly.

-- ───────────────────────────────────────────────────────────────────
-- 1. Drop dependent tables + clear LegalHold rows
-- ───────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS "HoldNotice"        CASCADE;
DROP TABLE IF EXISTS "HoldAttestation"   CASCADE;
DROP TABLE IF EXISTS "PreservationOrder" CASCADE;

-- AuditLog rows referencing LegalHolds keep their existing FK behaviour
-- (they only carry the resourceId polymorphically — there is no FK).
-- The LegalHold rows themselves are demo data; we delete and re-seed.
DELETE FROM "LegalHold";

DROP TYPE IF EXISTS "PreservationDataSource" CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- 2. New enums
-- ───────────────────────────────────────────────────────────────────

CREATE TYPE "DataSourceType" AS ENUM (
  'EMAIL_MAILBOX',
  'ARCHIVED_MAILBOX',
  'DEPARTED_USER_MAILBOX',
  'ONEDRIVE',
  'SHAREPOINT_SITE',
  'TEAMS_CHANNEL',
  'TEAMS_DM',
  'TEAMS_PRIVATE_CHANNEL',
  'SLACK_CHANNEL',
  'SLACK_DM',
  'GOOGLE_DRIVE',
  'GOOGLE_CHAT',
  'EPHEMERAL_CHAT_AUTO_DELETE',
  'LOCAL_DEVICE',
  'PHYSICAL_FILES',
  'THIRD_PARTY_SAAS',
  'OTHER'
);

CREATE TYPE "PreservationAction" AS ENUM (
  'LEGAL_HOLD_IN_PLACE',
  'COPIED_TO_PRESERVATION_VAULT',
  'SNAPSHOT_TAKEN',
  'RETENTION_SUSPENDED',
  'THIRD_PARTY_COLLECTION_PENDING',
  'NOT_APPLICABLE',
  'PRESERVATION_FAILED'
);

CREATE TYPE "LegalHoldEventType" AS ENUM (
  'HOLD_DRAFTED',
  'TRIGGER_RECORDED',
  'HOLD_ISSUED',
  'CUSTODIAN_ADDED',
  'CUSTODIAN_REMOVED',
  'CUSTODIAN_ACKNOWLEDGED',
  'CUSTODIAN_RE_ATTESTED',
  'REMINDER_SENT',
  'ESCALATED',
  'DATA_SOURCE_ADDED',
  'DATA_SOURCE_PRESERVATION_APPLIED',
  'DATA_SOURCE_PRESERVATION_CONFIRMED',
  'DATA_SOURCE_PRESERVATION_FAILED',
  'SCOPE_AMENDED',
  'CUSTODIAN_DEPARTED',
  'CUSTODIAN_PARTIALLY_RELEASED',
  'HOLD_RELEASED',
  'HOLD_RE_OPENED'
);

CREATE TYPE "AgentApprovalStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'APPROVED_WITH_OVERRIDE',
  'REJECTED',
  'AUTO_REJECTED'
);

-- ───────────────────────────────────────────────────────────────────
-- 3. Expand LegalHoldStatus enum
-- ───────────────────────────────────────────────────────────────────
-- Order: DRAFT, ISSUED, ACTIVE, PARTIALLY_RELEASED, RELEASED.
-- ALTER TYPE ADD VALUE works in PG 12+ but new values cannot be
-- referenced in the same migration transaction; we don't reference
-- them here, so this is safe.

ALTER TYPE "LegalHoldStatus" ADD VALUE 'ACTIVE'             AFTER 'ISSUED';
ALTER TYPE "LegalHoldStatus" ADD VALUE 'PARTIALLY_RELEASED' AFTER 'ACTIVE';

-- ───────────────────────────────────────────────────────────────────
-- 4. Reshape LegalHold
-- ───────────────────────────────────────────────────────────────────
-- Rows were deleted above; ALTER TABLE adds the new shape directly.

ALTER TABLE "LegalHold"
  DROP COLUMN IF EXISTS "scope",
  DROP COLUMN IF EXISTS "reason",
  ADD COLUMN "holdNumber"                TEXT,
  ADD COLUMN "title"                     TEXT NOT NULL,
  ADD COLUMN "scopeDescription"          TEXT NOT NULL,
  ADD COLUMN "jurisdictions"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "triggeredAt"               TIMESTAMP(3),
  ADD COLUMN "triggerEventDescription"   TEXT,
  ADD COLUMN "customPolicyJson"          JSONB,
  ADD COLUMN "privilegeFlags"            JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "affectsDepartedCustodians" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "createdById"               TEXT NOT NULL,
  ADD COLUMN "releasedById"              TEXT,
  ADD COLUMN "releaseReason"             TEXT;

CREATE UNIQUE INDEX "LegalHold_organizationId_holdNumber_key"
  ON "LegalHold"("organizationId", "holdNumber")
  WHERE "holdNumber" IS NOT NULL;

ALTER TABLE "LegalHold"
  ADD CONSTRAINT "LegalHold_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalHold"
  ADD CONSTRAINT "LegalHold_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- 5. New tables
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE "LegalHoldCustodian" (
  "id"                           TEXT NOT NULL,
  "legalHoldId"                  TEXT NOT NULL,
  "personId"                     TEXT NOT NULL,
  "acknowledgedAt"               TIMESTAMP(3),
  "acknowledgmentMetadata"       JSONB,
  "lastReAttestedAt"             TIMESTAMP(3),
  "nextReAttestationDueAt"       TIMESTAMP(3),
  "releasedAt"                   TIMESTAMP(3),
  "releaseReason"                TEXT,
  "departureRecordedAt"          TIMESTAMP(3),
  "departedCustodianRetentionId" TEXT,
  "createdAt"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LegalHoldCustodian_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LegalHoldCustodian_legalHoldId_personId_key"
  ON "LegalHoldCustodian"("legalHoldId", "personId");
CREATE UNIQUE INDEX "LegalHoldCustodian_departedCustodianRetentionId_key"
  ON "LegalHoldCustodian"("departedCustodianRetentionId");
CREATE INDEX "LegalHoldCustodian_legalHoldId_idx"
  ON "LegalHoldCustodian"("legalHoldId");
CREATE INDEX "LegalHoldCustodian_nextReAttestationDueAt_idx"
  ON "LegalHoldCustodian"("nextReAttestationDueAt");

CREATE TABLE "CustodianDataSource" (
  "id"                        TEXT NOT NULL,
  "legalHoldCustodianId"      TEXT NOT NULL,
  "type"                      "DataSourceType" NOT NULL,
  "externalIdentifier"        TEXT NOT NULL,
  "displayLabel"              TEXT NOT NULL,
  "preservationAction"        "PreservationAction" NOT NULL DEFAULT 'LEGAL_HOLD_IN_PLACE',
  "preservationAppliedAt"     TIMESTAMP(3),
  "preservationConfirmedAt"   TIMESTAMP(3),
  "preservationConfirmedById" TEXT,
  "preservationFailureReason" TEXT,
  "retentionPolicyConflict"   BOOLEAN NOT NULL DEFAULT FALSE,
  "metadataJson"              JSONB,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustodianDataSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustodianDataSource_legalHoldCustodianId_idx"
  ON "CustodianDataSource"("legalHoldCustodianId");
CREATE INDEX "CustodianDataSource_type_preservationAction_idx"
  ON "CustodianDataSource"("type", "preservationAction");

CREATE TABLE "HoldNoticeTemplate" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "jurisdictionKey" TEXT,
  "bodyMarkdown"    TEXT NOT NULL,
  "bodyHash"        TEXT NOT NULL,
  "version"         INTEGER NOT NULL DEFAULT 1,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HoldNoticeTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HoldNoticeTemplate_organizationId_jurisdictionKey_isActive_idx"
  ON "HoldNoticeTemplate"("organizationId", "jurisdictionKey", "isActive");

CREATE TABLE "HoldNoticeIssuance" (
  "id"                 TEXT NOT NULL,
  "legalHoldId"        TEXT NOT NULL,
  "templateId"         TEXT NOT NULL,
  "templateVersion"    INTEGER NOT NULL,
  "bodyHashAtIssuance" TEXT NOT NULL,
  "recipientCount"     INTEGER NOT NULL,
  "issuedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById"         TEXT NOT NULL,
  CONSTRAINT "HoldNoticeIssuance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HoldNoticeIssuance_legalHoldId_idx"
  ON "HoldNoticeIssuance"("legalHoldId");

CREATE TABLE "LegalHoldEvent" (
  "id"                  TEXT NOT NULL,
  "legalHoldId"         TEXT NOT NULL,
  "type"                "LegalHoldEventType" NOT NULL,
  "summary"             TEXT NOT NULL,
  "payloadJson"         JSONB,
  "actorId"             TEXT,
  "actorType"           TEXT NOT NULL DEFAULT 'USER',
  "resultingAuditLogId" TEXT,
  "occurredAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegalHoldEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegalHoldEvent_legalHoldId_occurredAt_idx"
  ON "LegalHoldEvent"("legalHoldId", "occurredAt");

CREATE TABLE "HoldTriggerEvent" (
  "id"               TEXT NOT NULL,
  "legalHoldId"      TEXT NOT NULL,
  "eventDescription" TEXT NOT NULL,
  "occurredAt"       TIMESTAMP(3) NOT NULL,
  "recordedById"     TEXT NOT NULL,
  "recordedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HoldTriggerEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HoldTriggerEvent_legalHoldId_idx"
  ON "HoldTriggerEvent"("legalHoldId");

CREATE TABLE "OrganizationHoldPolicy" (
  "id"                            TEXT NOT NULL,
  "organizationId"                TEXT NOT NULL,
  "defaultAttestationCadenceDays" INTEGER NOT NULL DEFAULT 90,
  "reminderLeadTimeDays"          INTEGER NOT NULL DEFAULT 7,
  "escalationChainJson"           JSONB NOT NULL DEFAULT '[]',
  "jurisdictionPoliciesJson"      JSONB,
  "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationHoldPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationHoldPolicy_organizationId_key"
  ON "OrganizationHoldPolicy"("organizationId");

CREATE TABLE "DepartedCustodianRetention" (
  "id"                      TEXT NOT NULL,
  "organizationId"          TEXT NOT NULL,
  "personId"                TEXT NOT NULL,
  "legalHoldId"             TEXT NOT NULL,
  "itPreservationOrderId"   TEXT,
  "preservationStatus"      "PreservationAction" NOT NULL DEFAULT 'THIRD_PARTY_COLLECTION_PENDING',
  "preservationConfirmedAt" TIMESTAMP(3),
  "notes"                   TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartedCustodianRetention_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DepartedCustodianRetention_organizationId_preservationSta_idx"
  ON "DepartedCustodianRetention"("organizationId", "preservationStatus");

CREATE TABLE "AgentDecision" (
  "id"                   TEXT NOT NULL,
  "organizationId"       TEXT NOT NULL,
  "agentName"            TEXT NOT NULL,
  "modelId"              TEXT NOT NULL,
  "modelVersion"         TEXT NOT NULL,
  "promptHash"           TEXT NOT NULL,
  "retrievedContextHash" TEXT,
  "recommendationJson"   JSONB NOT NULL,
  "confidence"           DOUBLE PRECISION,
  "approvalStatus"       "AgentApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById"         TEXT,
  "approvedAt"           TIMESTAMP(3),
  "overrideReason"       TEXT,
  "resultingAuditLogId"  TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentDecision_organizationId_agentName_createdAt_idx"
  ON "AgentDecision"("organizationId", "agentName", "createdAt");
CREATE INDEX "AgentDecision_approvalStatus_idx"
  ON "AgentDecision"("approvalStatus");

-- ───────────────────────────────────────────────────────────────────
-- 6. Foreign keys
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE "LegalHoldCustodian"
  ADD CONSTRAINT "LegalHoldCustodian_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegalHoldCustodian"
  ADD CONSTRAINT "LegalHoldCustodian_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegalHoldCustodian"
  ADD CONSTRAINT "LegalHoldCustodian_departedCustodianRetentionId_fkey"
  FOREIGN KEY ("departedCustodianRetentionId") REFERENCES "DepartedCustodianRetention"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustodianDataSource"
  ADD CONSTRAINT "CustodianDataSource_legalHoldCustodianId_fkey"
  FOREIGN KEY ("legalHoldCustodianId") REFERENCES "LegalHoldCustodian"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustodianDataSource"
  ADD CONSTRAINT "CustodianDataSource_preservationConfirmedById_fkey"
  FOREIGN KEY ("preservationConfirmedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HoldNoticeTemplate"
  ADD CONSTRAINT "HoldNoticeTemplate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HoldNoticeIssuance"
  ADD CONSTRAINT "HoldNoticeIssuance_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HoldNoticeIssuance"
  ADD CONSTRAINT "HoldNoticeIssuance_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "HoldNoticeTemplate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HoldNoticeIssuance"
  ADD CONSTRAINT "HoldNoticeIssuance_issuedById_fkey"
  FOREIGN KEY ("issuedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LegalHoldEvent"
  ADD CONSTRAINT "LegalHoldEvent_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegalHoldEvent"
  ADD CONSTRAINT "LegalHoldEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LegalHoldEvent"
  ADD CONSTRAINT "LegalHoldEvent_resultingAuditLogId_fkey"
  FOREIGN KEY ("resultingAuditLogId") REFERENCES "AuditLog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HoldTriggerEvent"
  ADD CONSTRAINT "HoldTriggerEvent_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HoldTriggerEvent"
  ADD CONSTRAINT "HoldTriggerEvent_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationHoldPolicy"
  ADD CONSTRAINT "OrganizationHoldPolicy_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartedCustodianRetention"
  ADD CONSTRAINT "DepartedCustodianRetention_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartedCustodianRetention"
  ADD CONSTRAINT "DepartedCustodianRetention_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "Person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DepartedCustodianRetention"
  ADD CONSTRAINT "DepartedCustodianRetention_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "LegalHold"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentDecision"
  ADD CONSTRAINT "AgentDecision_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentDecision"
  ADD CONSTRAINT "AgentDecision_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentDecision"
  ADD CONSTRAINT "AgentDecision_resultingAuditLogId_fkey"
  FOREIGN KEY ("resultingAuditLogId") REFERENCES "AuditLog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
