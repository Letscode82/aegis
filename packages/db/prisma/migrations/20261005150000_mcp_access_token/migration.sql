-- C-12 — inbound MCP-server access token. Additive: one new enum + one new
-- table, fully standalone (plain-scalar organizationId + createdById, no FK)
-- so no existing table is touched. The token stores only the SHA-256 hash of
-- the raw bearer value and binds requests to one org; the MCP surface itself
-- is gated OFF by default by the AEGIS_MCP_ENABLED flag.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "McpAccessTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "McpAccessToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "McpAccessTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "McpAccessToken_tokenHash_key" ON "McpAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "McpAccessToken_organizationId_status_idx" ON "McpAccessToken"("organizationId", "status");
