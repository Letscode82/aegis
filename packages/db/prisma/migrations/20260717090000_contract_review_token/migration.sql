-- CreateEnum
CREATE TYPE "ContractReviewTokenStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ContractReviewToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "ContractReviewTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "lastDecision" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractReviewToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractReviewToken_tokenHash_key" ON "ContractReviewToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ContractReviewToken_contractId_idx" ON "ContractReviewToken"("contractId");

-- CreateIndex
CREATE INDEX "ContractReviewToken_personId_idx" ON "ContractReviewToken"("personId");

-- CreateIndex
CREATE INDEX "ContractReviewToken_organizationId_status_idx" ON "ContractReviewToken"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "ContractReviewToken" ADD CONSTRAINT "ContractReviewToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReviewToken" ADD CONSTRAINT "ContractReviewToken_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractReviewToken" ADD CONSTRAINT "ContractReviewToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
