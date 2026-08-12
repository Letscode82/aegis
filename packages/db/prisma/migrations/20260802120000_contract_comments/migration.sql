-- Contract collaboration / comments (CTR-10). Threaded comments on a contract
-- (contract-level or clause-scoped), with INTERNAL (business ↔ legal) vs SHARED
-- (visible to the external counterparty) visibility. Additive.
CREATE TYPE "ContractCommentVisibility" AS ENUM ('INTERNAL', 'SHARED');

CREATE TABLE "ContractComment" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId"     TEXT NOT NULL,
    "clauseId"       TEXT,
    "parentId"       TEXT,
    "authorUserId"   TEXT,
    "authorPersonId" TEXT,
    "visibility"     "ContractCommentVisibility" NOT NULL DEFAULT 'INTERNAL',
    "body"           TEXT NOT NULL,
    "resolvedAt"     TIMESTAMP(3),
    "resolvedById"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractComment_organizationId_contractId_createdAt_idx" ON "ContractComment"("organizationId", "contractId", "createdAt");
CREATE INDEX "ContractComment_contractId_clauseId_idx" ON "ContractComment"("contractId", "clauseId");
CREATE INDEX "ContractComment_contractId_visibility_idx" ON "ContractComment"("contractId", "visibility");

ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractComment" ADD CONSTRAINT "ContractComment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
