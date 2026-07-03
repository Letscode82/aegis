-- W2-5: escalation + approval-gate routing-rule actions. Additive —
-- all three columns nullable; existing rules and tickets unaffected.

ALTER TABLE "IntakeRoutingRule" ADD COLUMN "escalateToUserId" TEXT;
ALTER TABLE "IntakeRoutingRule" ADD COLUMN "requireApprovalFromUserId" TEXT;
ALTER TABLE "IntakeRoutingRule" ADD CONSTRAINT "IntakeRoutingRule_escalateToUserId_fkey" FOREIGN KEY ("escalateToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakeRoutingRule" ADD CONSTRAINT "IntakeRoutingRule_requireApprovalFromUserId_fkey" FOREIGN KEY ("requireApprovalFromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntakeTicket" ADD COLUMN "approvalGateUserId" TEXT;
ALTER TABLE "IntakeTicket" ADD CONSTRAINT "IntakeTicket_approvalGateUserId_fkey" FOREIGN KEY ("approvalGateUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
