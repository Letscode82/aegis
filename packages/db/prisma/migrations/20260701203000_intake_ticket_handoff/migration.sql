-- Intake Phase 1 item 6: agent <-> human hand-off model. Append-only
-- baton-pass log (IntakeTicketHandoff) + denormalized current-holder
-- fields on IntakeTicket. Additive — all new columns nullable.

ALTER TABLE "IntakeTicket" ADD COLUMN "handoffHolder" TEXT;
ALTER TABLE "IntakeTicket" ADD COLUMN "handoffUserId" TEXT;
ALTER TABLE "IntakeTicket" ADD COLUMN "handoffUpdatedAt" TIMESTAMP(3);

CREATE TABLE "IntakeTicketHandoff" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromHolder" TEXT,
    "toHolder" TEXT NOT NULL,
    "toUserId" TEXT,
    "reason" TEXT,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "agentDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeTicketHandoff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeTicketHandoff_ticketId_createdAt_idx" ON "IntakeTicketHandoff"("ticketId", "createdAt");
ALTER TABLE "IntakeTicketHandoff" ADD CONSTRAINT "IntakeTicketHandoff_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
