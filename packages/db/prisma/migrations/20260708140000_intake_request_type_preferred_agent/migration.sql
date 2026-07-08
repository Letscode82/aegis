-- Program #5: bind a preferred agent to a request type. Additive.
ALTER TABLE "IntakeRequestType" ADD COLUMN "preferredAgentId" TEXT;
