-- Polymorphic owner for AgentDecision (conservative-AI gate goes live).
--
-- The 4b-locked AgentDecision contract shipped empty; the intake-side
-- lifecycle (Intake P2b) now writes rows that must attach to an
-- IntakeTicket. Rather than a per-module FK, AgentDecision gains the same
-- polymorphic (resourceType, resourceId) pair used by Document — so any
-- module (intake, legal hold, …) can find "the open decision for resource
-- X". Both columns nullable; additive against an empty table.

ALTER TABLE "AgentDecision" ADD COLUMN "resourceType" TEXT;
ALTER TABLE "AgentDecision" ADD COLUMN "resourceId" TEXT;

CREATE INDEX "AgentDecision_organizationId_resourceType_resourceId_idx"
  ON "AgentDecision"("organizationId", "resourceType", "resourceId");
