-- W-C: request types can bind a workflow-engine ladder. Additive.
ALTER TABLE "IntakeRequestType" ADD COLUMN "workflowKey" TEXT;
