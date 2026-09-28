-- ONE Legal console runs (OL-4): durable record of the agentic front door's
-- runs (ConsoleSession) and their governed tasks (LegalTask). Additive:
-- 2 tables + indexes + 1 FK. organizationId is a plain scalar (same localized
-- pattern as the DSAR tables) — no existing table is touched.

-- CreateTable
CREATE TABLE "ConsoleSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startedById" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsoleSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toolId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "resourceType" TEXT,
    "resourceId" TEXT,
    "resourceLabel" TEXT,
    "navigate" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsoleSession_organizationId_updatedAt_idx" ON "ConsoleSession"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "LegalTask_organizationId_sessionId_idx" ON "LegalTask"("organizationId", "sessionId");

-- CreateIndex
CREATE INDEX "LegalTask_sessionId_createdAt_idx" ON "LegalTask"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "LegalTask" ADD CONSTRAINT "LegalTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConsoleSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
