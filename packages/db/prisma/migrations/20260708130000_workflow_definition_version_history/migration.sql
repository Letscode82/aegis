-- Workflow version history: immutable per-save snapshots. Additive.
CREATE TABLE "WorkflowDefinitionVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stepsJson" JSONB NOT NULL,
    "savedById" TEXT NOT NULL,
    "changeLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDefinitionVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowDefinitionVersion_definitionId_version_key"
  ON "WorkflowDefinitionVersion"("definitionId", "version");
CREATE INDEX "WorkflowDefinitionVersion_definitionId_createdAt_idx"
  ON "WorkflowDefinitionVersion"("definitionId", "createdAt");

ALTER TABLE "WorkflowDefinitionVersion"
  ADD CONSTRAINT "WorkflowDefinitionVersion_definitionId_fkey"
  FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
