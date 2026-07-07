-- W-A: workflow engine — approval ladders as data (5 tables, 5 enums).
-- Ported per docs/workflow-engine-assessment.md. Additive.

CREATE TYPE "WorkflowStepKind" AS ENUM ('HUMAN', 'AGENT');
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "WorkflowAction" AS ENUM ('START', 'APPROVE', 'REJECT', 'SEND_BACK', 'CANCEL');
CREATE TYPE "WorkflowAgentTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'ESCALATED');

CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowDefinition_organizationId_key_key"
  ON "WorkflowDefinition"("organizationId", "key");
CREATE INDEX "WorkflowDefinition_organizationId_isActive_idx"
  ON "WorkflowDefinition"("organizationId", "isActive");

ALTER TABLE "WorkflowDefinition"
  ADD CONSTRAINT "WorkflowDefinition_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "screenKey" TEXT NOT NULL,
    "approverRole" TEXT,
    "kind" "WorkflowStepKind" NOT NULL DEFAULT 'HUMAN',
    "agentConfigJson" JSONB NOT NULL DEFAULT '{}',
    "slaHours" INTEGER,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowStep_definitionId_stepOrder_key"
  ON "WorkflowStep"("definitionId", "stepOrder");
CREATE INDEX "WorkflowStep_definitionId_stepOrder_idx"
  ON "WorkflowStep"("definitionId", "stepOrder");

ALTER TABLE "WorkflowStep"
  ADD CONSTRAINT "WorkflowStep_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "currentStepOrder" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedById" TEXT NOT NULL,
    "contextJson" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "stepEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowInstance_organizationId_entityType_entityId_idx"
  ON "WorkflowInstance"("organizationId", "entityType", "entityId");
CREATE INDEX "WorkflowInstance_organizationId_status_idx"
  ON "WorkflowInstance"("organizationId", "status");

ALTER TABLE "WorkflowInstance"
  ADD CONSTRAINT "WorkflowInstance_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkflowInstance"
  ADD CONSTRAINT "WorkflowInstance_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "fromStepOrder" INTEGER NOT NULL,
    "toStepOrder" INTEGER,
    "action" "WorkflowAction" NOT NULL,
    "actor" TEXT NOT NULL,
    "comment" TEXT,
    "resultingAuditLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowTransition_instanceId_createdAt_idx"
  ON "WorkflowTransition"("instanceId", "createdAt");

ALTER TABLE "WorkflowTransition"
  ADD CONSTRAINT "WorkflowTransition_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkflowAgentTask" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "status" "WorkflowAgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "outputJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowAgentTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowAgentTask_status_idx"
  ON "WorkflowAgentTask"("status");
CREATE INDEX "WorkflowAgentTask_instanceId_stepOrder_idx"
  ON "WorkflowAgentTask"("instanceId", "stepOrder");

ALTER TABLE "WorkflowAgentTask"
  ADD CONSTRAINT "WorkflowAgentTask_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
