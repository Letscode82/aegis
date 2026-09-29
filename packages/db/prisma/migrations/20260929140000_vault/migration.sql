-- V1 — Vault project collections. Additive: 1 enum value + 1 table. Documents
-- filed into a vault reuse the shared Document entity (ownerType VAULT, ownerId
-- = Vault.id); no existing table is touched. organizationId is a plain scalar
-- (same localized pattern as ConsoleSession / DocumentEmbedding).

-- AlterEnum (additive)
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'VAULT';

-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vault_organizationId_updatedAt_idx" ON "Vault"("organizationId", "updatedAt");
