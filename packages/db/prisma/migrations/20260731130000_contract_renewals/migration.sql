-- Obligations & Renewals (CLM). Additive: two new enum types, six renewal
-- columns on Contract, and two columns on Obligation. All defaulted/nullable,
-- so existing rows are valid without a backfill.

-- Renewal decision lifecycle on Contract.
CREATE TYPE "RenewalDecision" AS ENUM ('UNDECIDED', 'RENEW', 'RENEGOTIATE', 'NON_RENEWAL');

ALTER TABLE "Contract"
  ADD COLUMN "renewalDecision"     "RenewalDecision" NOT NULL DEFAULT 'UNDECIDED',
  ADD COLUMN "renewalDecisionAt"   TIMESTAMP(3),
  ADD COLUMN "renewalDecisionById" TEXT,
  ADD COLUMN "renewalTermMonths"   INTEGER,
  ADD COLUMN "renewalNoticeSentAt" TIMESTAMP(3),
  ADD COLUMN "renewalCount"        INTEGER NOT NULL DEFAULT 0;

-- Obligation categorization + resolution timestamp (promoted from metadata).
CREATE TYPE "ObligationType" AS ENUM ('PAYMENT', 'DELIVERABLE', 'REPORTING', 'RENEWAL_NOTICE', 'COMPLIANCE', 'OTHER');

ALTER TABLE "Obligation"
  ADD COLUMN "type"       "ObligationType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "Obligation_organizationId_type_status_idx" ON "Obligation"("organizationId", "type", "status");
