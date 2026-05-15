-- Phase 1b — typed assignee on IntakeTicket
--
-- Adds a nullable User FK alongside the existing free-text `assignedTo`
-- column. Both coexist during the migration window so legacy rows
-- continue to render via free-text while new code paths set the FK.
-- The legacy column is scheduled to sunset at end of P3 (per
-- docs/intake-roadmap.md §5.1).
--
-- Index supports the "My Queue" filter and Kanban swimlane queries.
-- ON DELETE SET NULL keeps audit history resolvable even if a User
-- row is deleted.

ALTER TABLE "IntakeTicket"
  ADD COLUMN "assignedToUserId" TEXT;

ALTER TABLE "IntakeTicket"
  ADD CONSTRAINT "IntakeTicket_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "IntakeTicket_organizationId_assignedToUserId_idx"
  ON "IntakeTicket"("organizationId", "assignedToUserId");
