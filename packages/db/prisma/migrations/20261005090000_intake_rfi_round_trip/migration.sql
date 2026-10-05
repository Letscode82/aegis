-- CW-5 — Cockpit RFI (Request For Information) round-trip. Additive: one new
-- enum + one new table, no existing table altered. The FKs to Organization
-- and IntakeTicket cascade on delete, so cleanup flows through the parents
-- (no edits to Organization / IntakeTicket beyond the implicit back-relation).

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "IntakeRfiStatus" AS ENUM ('OPEN', 'ANSWERED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "IntakeRfi" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "IntakeRfiStatus" NOT NULL DEFAULT 'OPEN',
    "question" TEXT NOT NULL,
    "askedById" TEXT NOT NULL,
    "askedByName" TEXT NOT NULL,
    "answer" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeRfi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntakeRfi_ticketId_status_idx" ON "IntakeRfi"("ticketId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntakeRfi_organizationId_status_idx" ON "IntakeRfi"("organizationId", "status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "IntakeRfi" ADD CONSTRAINT "IntakeRfi_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "IntakeRfi" ADD CONSTRAINT "IntakeRfi_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
