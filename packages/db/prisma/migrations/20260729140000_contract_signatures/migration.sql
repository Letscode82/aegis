-- CLM Phase 5d: execution & signatures. Additive — a new enum + table.
CREATE TYPE "SignatureParty" AS ENUM ('INTERNAL', 'COUNTERPARTY');

CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "party" "SignatureParty" NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerPersonId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'recorded',
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractSignature_organizationId_contractId_idx" ON "ContractSignature"("organizationId", "contractId");

ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
