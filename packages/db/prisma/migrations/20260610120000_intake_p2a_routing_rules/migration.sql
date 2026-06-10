-- P2a (demo-lite) — server-side intake routing rules.
--
-- IntakeRoutingRule: composable conditions (matchType /
-- matchPriority / matchDepartment / matchKeyword, AND semantics) +
-- actions (setAssigneeUserId / setPriority / setSlaHours), evaluated
-- in ascending evalOrder inside the saveTicketsV8 chokepoint for
-- untriaged tickets only. timesFired / lastFiredAt feed the SLA
-- Operations effectiveness panel.
--
-- IntakeTicket.firedRulesJson: which rules fired on this ticket —
-- written only by applyRoutingRules; the Cockpit renders the
-- "routed by" chip from it. Additive, nullable.

-- AlterTable
ALTER TABLE "IntakeTicket" ADD COLUMN     "firedRulesJson" JSONB;

-- CreateTable
CREATE TABLE "IntakeRoutingRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "evalOrder" INTEGER NOT NULL DEFAULT 100,
    "matchType" TEXT,
    "matchPriority" TEXT,
    "matchDepartment" TEXT,
    "matchKeyword" TEXT,
    "setAssigneeUserId" TEXT,
    "setPriority" TEXT,
    "setSlaHours" INTEGER,
    "timesFired" INTEGER NOT NULL DEFAULT 0,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeRoutingRule_organizationId_enabled_evalOrder_idx" ON "IntakeRoutingRule"("organizationId", "enabled", "evalOrder");

-- AddForeignKey
ALTER TABLE "IntakeRoutingRule" ADD CONSTRAINT "IntakeRoutingRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRoutingRule" ADD CONSTRAINT "IntakeRoutingRule_setAssigneeUserId_fkey" FOREIGN KEY ("setAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
