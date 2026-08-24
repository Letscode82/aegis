-- CAP-5: Case AutoPilot — single-prompt agentic orchestrator over a collection.
-- Additive: two new tables, both cascade off ReviewSet. No existing rows change.

CREATE TABLE "CaseAutoPilotRun" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewSetId"    TEXT NOT NULL,
    "directive"      TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PLANNING',
    "planJson"       JSONB,
    "summary"        TEXT,
    "degraded"       BOOLEAN NOT NULL DEFAULT false,
    "model"          TEXT,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseAutoPilotRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CaseAutoPilotRun_organizationId_reviewSetId_idx" ON "CaseAutoPilotRun"("organizationId", "reviewSetId");
ALTER TABLE "CaseAutoPilotRun"
    ADD CONSTRAINT "CaseAutoPilotRun_reviewSetId_fkey"
    FOREIGN KEY ("reviewSetId") REFERENCES "ReviewSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CaseAutoPilotStep" (
    "id"                  TEXT NOT NULL,
    "organizationId"      TEXT NOT NULL,
    "runId"               TEXT NOT NULL,
    "ordinal"             INTEGER NOT NULL,
    "tool"                TEXT NOT NULL,
    "title"               TEXT NOT NULL,
    "kind"                TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'PENDING',
    "inputJson"           JSONB,
    "outputJson"          JSONB,
    "agentDecisionId"     TEXT,
    "resultingAuditLogId" TEXT,
    "error"               TEXT,
    "startedAt"           TIMESTAMP(3),
    "finishedAt"          TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseAutoPilotStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseAutoPilotStep_runId_ordinal_key" ON "CaseAutoPilotStep"("runId", "ordinal");
CREATE INDEX "CaseAutoPilotStep_organizationId_runId_idx" ON "CaseAutoPilotStep"("organizationId", "runId");
ALTER TABLE "CaseAutoPilotStep"
    ADD CONSTRAINT "CaseAutoPilotStep_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "CaseAutoPilotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
