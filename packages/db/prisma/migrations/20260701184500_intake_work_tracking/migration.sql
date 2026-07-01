-- Intake Phase 1 item 2: delivery/work-tracking layer — per-ticket
-- assignments (who is involved) + sub-tasks (who is doing what) + a
-- delivery workStatus distinct from the request status. Additive.

ALTER TABLE "IntakeTicket" ADD COLUMN "workStatus" TEXT;

CREATE TABLE "IntakeTicketAssignment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'support',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    CONSTRAINT "IntakeTicketAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeTicketAssignment_ticketId_userId_role_key" ON "IntakeTicketAssignment"("ticketId", "userId", "role");
CREATE INDEX "IntakeTicketAssignment_ticketId_idx" ON "IntakeTicketAssignment"("ticketId");
CREATE INDEX "IntakeTicketAssignment_userId_idx" ON "IntakeTicketAssignment"("userId");
ALTER TABLE "IntakeTicketAssignment" ADD CONSTRAINT "IntakeTicketAssignment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntakeTicketTask" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeTicketTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeTicketTask_ticketId_sortOrder_idx" ON "IntakeTicketTask"("ticketId", "sortOrder");
CREATE INDEX "IntakeTicketTask_assigneeUserId_idx" ON "IntakeTicketTask"("assigneeUserId");
ALTER TABLE "IntakeTicketTask" ADD CONSTRAINT "IntakeTicketTask_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntakeTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
