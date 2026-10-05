-- C-10 — login-less client portal access token. Additive: one new enum + one
-- new table. organizationId is a plain scalar (localized pattern, same as the
-- SSO / connector-credential tables) so Organization is untouched; the FK to
-- Person cascades cleanup.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClientPortalTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientPortalToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "status" "ClientPortalTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientPortalToken_tokenHash_key" ON "ClientPortalToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientPortalToken_personId_idx" ON "ClientPortalToken"("personId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientPortalToken_organizationId_status_idx" ON "ClientPortalToken"("organizationId", "status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ClientPortalToken" ADD CONSTRAINT "ClientPortalToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
