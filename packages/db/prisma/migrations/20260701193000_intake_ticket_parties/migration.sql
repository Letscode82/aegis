-- Intake Phase 1 item 3: people/entities involved in a ticket, drawn from
-- the shared Person / Counterparty entities with a role. Additive.

CREATE TABLE "IntakeTicketParty" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "personId" TEXT,
    "counterpartyId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'other',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeTicketParty_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeTicketParty_ticketId_idx" ON "IntakeTicketParty"("ticketId");
CREATE INDEX "IntakeTicketParty_personId_idx" ON "IntakeTicketParty"("personId");
CREATE INDEX "IntakeTicketParty_counterpartyId_idx" ON "IntakeTicketParty"("counterpartyId");
ALTER TABLE "IntakeTicketParty" ADD CONSTRAINT "IntakeTicketParty_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeTicketParty" ADD CONSTRAINT "IntakeTicketParty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakeTicketParty" ADD CONSTRAINT "IntakeTicketParty_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
