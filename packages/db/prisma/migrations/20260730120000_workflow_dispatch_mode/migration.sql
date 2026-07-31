-- Additive: per-definition dispatch behaviour for auto-assigned ladders.
-- "manual" (default) holds the newly-started instance on its opening
-- step; "auto" advances the opening HUMAN intake step once to the first
-- review stage. Never auto-approves an AGENT step or a sign-off gate.
ALTER TABLE "WorkflowDefinition"
  ADD COLUMN "dispatchMode" TEXT NOT NULL DEFAULT 'manual';
