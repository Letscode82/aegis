-- Intake P4b: Microsoft 365 mailbox polling source. AEGIS reads inbound
-- intake email from this mailbox via the delegated Graph service account
-- and runs each message through the P4a ingest path. lastReceivedAt is
-- the delta watermark. Additive; no existing rows affected.
CREATE TABLE "IntakeEmailMailbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastReceivedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeEmailMailbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntakeEmailMailbox_organizationId_address_key" ON "IntakeEmailMailbox"("organizationId", "address");
CREATE INDEX "IntakeEmailMailbox_organizationId_enabled_idx" ON "IntakeEmailMailbox"("organizationId", "enabled");

ALTER TABLE "IntakeEmailMailbox" ADD CONSTRAINT "IntakeEmailMailbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
