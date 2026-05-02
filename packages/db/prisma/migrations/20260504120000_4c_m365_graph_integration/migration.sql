-- ════════════════════════════════════════════════════════════════════
-- Sub-PR 4c — Microsoft Graph real integration.
-- ════════════════════════════════════════════════════════════════════
--
-- Adds:
--   - OrganizationM365Credential — per-org tenant + client id + secret
--     (encrypted at rest; 4c ships dev-only plaintext; sunset before
--     first paying customer).
--   - Graph linkage columns on LegalHold, LegalHoldCustodian,
--     CustodianDataSource. All nullable; existing rows stay valid.
--     Populated only after a successful real-Graph operation.
--
-- No data migration needed — every new column is nullable.

-- ───────────────────────────────────────────────────────────────────
-- 1. Per-organisation M365 credential row
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE "OrganizationM365Credential" (
  "id"                    TEXT         NOT NULL,
  "organizationId"        TEXT         NOT NULL,
  "tenantId"              TEXT         NOT NULL,
  "clientId"              TEXT         NOT NULL,
  "encryptedClientSecret" BYTEA        NOT NULL,
  "graphBaseUrl"          TEXT         NOT NULL DEFAULT 'https://graph.microsoft.com',
  "isActive"              BOOLEAN      NOT NULL DEFAULT TRUE,
  "lastVerifiedAt"        TIMESTAMP(3),
  "lastErrorMessage"      TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "rotatedAt"             TIMESTAMP(3),
  CONSTRAINT "OrganizationM365Credential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationM365Credential_organizationId_key"
  ON "OrganizationM365Credential"("organizationId");

CREATE INDEX "OrganizationM365Credential_organizationId_isActive_idx"
  ON "OrganizationM365Credential"("organizationId", "isActive");

ALTER TABLE "OrganizationM365Credential"
  ADD CONSTRAINT "OrganizationM365Credential_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- 2. Graph linkage columns on existing legal-hold tables
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE "LegalHold"
  ADD COLUMN "graphEdiscoveryCaseId" TEXT,
  ADD COLUMN "graphHoldPolicyId"     TEXT;

ALTER TABLE "LegalHoldCustodian"
  ADD COLUMN "graphCustodianId"   TEXT,
  ADD COLUMN "graphHoldStatus"    TEXT,
  ADD COLUMN "graphLastSyncedAt"  TIMESTAMP(3);

ALTER TABLE "CustodianDataSource"
  ADD COLUMN "graphSourceId"   TEXT,
  ADD COLUMN "graphSourceType" TEXT;
