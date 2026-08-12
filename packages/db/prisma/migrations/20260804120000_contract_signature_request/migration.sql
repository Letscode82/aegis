-- Native e-signature requests (CTR-15). A tokenised signing link per signer;
-- the resulting ContractSignature carries the content-hash binding. Additive.
CREATE TYPE "ContractSignatureRequestStatus" AS ENUM ('SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'REVOKED', 'EXPIRED');

CREATE TABLE "ContractSignatureRequest" (
    "id"                   TEXT NOT NULL,
    "organizationId"       TEXT NOT NULL,
    "contractId"           TEXT NOT NULL,
    "party"                "SignatureParty" NOT NULL,
    "signerName"           TEXT NOT NULL,
    "signerEmail"          TEXT,
    "signerPersonId"       TEXT,
    "tokenHash"            TEXT NOT NULL,
    "status"               "ContractSignatureRequestStatus" NOT NULL DEFAULT 'SENT',
    "signingOrder"         INTEGER NOT NULL DEFAULT 1,
    "expiresAt"            TIMESTAMP(3) NOT NULL,
    "viewedAt"             TIMESTAMP(3),
    "signedAt"             TIMESTAMP(3),
    "declinedReason"       TEXT,
    "resultingSignatureId" TEXT,
    "signerIp"             TEXT,
    "signerUserAgent"      TEXT,
    "createdById"          TEXT NOT NULL,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContractSignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractSignatureRequest_tokenHash_key" ON "ContractSignatureRequest"("tokenHash");
CREATE INDEX "ContractSignatureRequest_organizationId_contractId_idx" ON "ContractSignatureRequest"("organizationId", "contractId");

ALTER TABLE "ContractSignatureRequest" ADD CONSTRAINT "ContractSignatureRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractSignatureRequest" ADD CONSTRAINT "ContractSignatureRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
