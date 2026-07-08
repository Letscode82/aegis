-- Workflow Designer: edit-generation counter on definitions. Additive.
ALTER TABLE "WorkflowDefinition" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WorkflowDefinition" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
