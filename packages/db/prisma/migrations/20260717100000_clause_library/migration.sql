-- CreateTable
CREATE TABLE "ClauseLibraryEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clauseType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "standardText" TEXT NOT NULL,
    "fallbackText" TEXT,
    "guidance" TEXT,
    "riskIfDeviated" "ContractRisk" NOT NULL DEFAULT 'MEDIUM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClauseLibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClauseLibraryEntry_organizationId_active_idx" ON "ClauseLibraryEntry"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ClauseLibraryEntry_organizationId_clauseType_key" ON "ClauseLibraryEntry"("organizationId", "clauseType");

-- AddForeignKey
ALTER TABLE "ClauseLibraryEntry" ADD CONSTRAINT "ClauseLibraryEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
