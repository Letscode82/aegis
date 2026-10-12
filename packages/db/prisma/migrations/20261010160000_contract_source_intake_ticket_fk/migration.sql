-- Harden Contract.sourceIntakeTicketId from a loose String into a real
-- foreign key to IntakeTicket. SetNull so purging a ticket never orphans or
-- deletes the contract it produced — the contract outlives its intake record.

-- Defensive: null out any pre-existing orphaned pointers (ids that no longer
-- resolve to an IntakeTicket) so the constraint can be added without failing
-- on historical data. No-op on a fresh/consistent database.
UPDATE "Contract" c
SET "sourceIntakeTicketId" = NULL
WHERE c."sourceIntakeTicketId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "IntakeTicket" t WHERE t."id" = c."sourceIntakeTicketId"
  );

-- CreateIndex
CREATE INDEX "Contract_sourceIntakeTicketId_idx" ON "Contract"("sourceIntakeTicketId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_sourceIntakeTicketId_fkey" FOREIGN KEY ("sourceIntakeTicketId") REFERENCES "IntakeTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
