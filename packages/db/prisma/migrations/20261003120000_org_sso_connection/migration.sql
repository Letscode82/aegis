-- C-6 — per-tenant SSO / SAML federation. Additive: one new enum + one new
-- table, no existing table touched. organizationId is a plain scalar
-- (localized pattern, same as Skill / ConsoleSession), so there is no
-- cross-table migration and no change to Organization.

DO $$ BEGIN
  CREATE TYPE "SsoProtocol" AS ENUM ('OIDC', 'SAML');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "OrganizationSsoConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "protocol" "SsoProtocol" NOT NULL DEFAULT 'OIDC',
    "connectionName" TEXT NOT NULL,
    "emailDomains" TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    "defaultRoleName" TEXT NOT NULL DEFAULT 'requester',
    "jitProvisioning" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSsoConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSsoConnection_organizationId_key" ON "OrganizationSsoConnection"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationSsoConnection_organizationId_idx" ON "OrganizationSsoConnection"("organizationId");
