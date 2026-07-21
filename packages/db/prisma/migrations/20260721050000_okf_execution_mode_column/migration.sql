-- oKF-5: persist the agent's execution engine so the Agent Designer can
-- edit it durably. "okf" runs entirely from the published definition;
-- "code" runs the code-shipped process() (tool-augmented agents).
ALTER TABLE "AgentDefinition" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'code';
