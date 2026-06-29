-- Intake email hardening: dedupe inbound delivery + opt-in auto-ack.
-- Additive + nullable/defaulted, so existing rows are unaffected.

-- Dedupe key for inbound email/webhook delivery (NULL for FORM/COPILOT).
ALTER TABLE "IntakeTicket" ADD COLUMN "externalMessageId" TEXT;
-- NULLs are distinct in Postgres, so unscoped channels never collide.
CREATE UNIQUE INDEX "IntakeTicket_organizationId_externalMessageId_key"
  ON "IntakeTicket"("organizationId", "externalMessageId");

-- Opt-in outbound auto-acknowledgement per mailbox.
ALTER TABLE "IntakeEmailMailbox" ADD COLUMN "autoAckEnabled" BOOLEAN NOT NULL DEFAULT false;
