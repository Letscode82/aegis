-- Intake Phase 1: configurable request types (workstreams) + structured
-- fields, and per-ticket linkage. Additive; existing rows unaffected.

CREATE TABLE "IntakeRequestType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workstream" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stagesJson" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeRequestType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeRequestType_organizationId_key_key" ON "IntakeRequestType"("organizationId", "key");
CREATE INDEX "IntakeRequestType_organizationId_active_idx" ON "IntakeRequestType"("organizationId", "active");
ALTER TABLE "IntakeRequestType" ADD CONSTRAINT "IntakeRequestType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntakeRequestField" (
    "id" TEXT NOT NULL,
    "requestTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "optionsJson" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "IntakeRequestField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntakeRequestField_requestTypeId_key_key" ON "IntakeRequestField"("requestTypeId", "key");
CREATE INDEX "IntakeRequestField_requestTypeId_sortOrder_idx" ON "IntakeRequestField"("requestTypeId", "sortOrder");
ALTER TABLE "IntakeRequestField" ADD CONSTRAINT "IntakeRequestField_requestTypeId_fkey" FOREIGN KEY ("requestTypeId") REFERENCES "IntakeRequestType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntakeTicket" ADD COLUMN "requestTypeId" TEXT;
ALTER TABLE "IntakeTicket" ADD COLUMN "requestFieldValuesJson" JSONB;
