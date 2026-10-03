-- F-8 — encrypted token persistence for the shared connector / OAuth framework
-- (@aegis/connectors). Additive: one new table, no existing table touched.
-- organizationId is a plain scalar (localized pattern, same as Skill /
-- ConsoleSession), so there is no cross-table migration. OAuth access/refresh
-- tokens are stored encrypted (BYTEA) via @aegis/db.encryptSecret.

CREATE TABLE IF NOT EXISTS "OrgConnectorCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "accountLabel" TEXT,
    "scopesGranted" TEXT,
    "encryptedAccessToken" BYTEA,
    "encryptedRefreshToken" BYTEA,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenType" TEXT,
    "authorizedById" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgConnectorCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgConnectorCredential_organizationId_connectorId_key" ON "OrgConnectorCredential"("organizationId", "connectorId");
CREATE INDEX IF NOT EXISTS "OrgConnectorCredential_organizationId_status_idx" ON "OrgConnectorCredential"("organizationId", "status");
