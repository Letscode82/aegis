-- Privacy module — DSAR case handling (PRIV-1). Additive.
-- Extends DataSubjectRequest with handler assignment, aiR relevance criteria,
-- identity-verification detail, statutory-extension, legal-hold-conflict
-- bookkeeping, and delivery fields. Adds the AI relevance review unit
-- (DSARReviewItem) and the login-less data-subject access token
-- (DSARAccessToken). No existing column changes type or drops.

-- ── New enums ────────────────────────────────────────────────────────
CREATE TYPE "DSARReviewVerdict" AS ENUM ('RELEVANT', 'NOT_RELEVANT', 'UNCLEAR');
CREATE TYPE "DSARReviewDecision" AS ENUM ('PENDING', 'CONFIRMED', 'OVERRIDDEN');
CREATE TYPE "DSARAccessTokenPurpose" AS ENUM ('STATUS', 'DELIVERY');

-- ── DataSubjectRequest: case-handling columns (all additive) ─────────
ALTER TABLE "DataSubjectRequest"
    ADD COLUMN "assignedToUserId"           TEXT,
    ADD COLUMN "relevanceCriteria"          TEXT,
    ADD COLUMN "subjectSummary"             TEXT,
    ADD COLUMN "source"                     TEXT NOT NULL DEFAULT 'internal',
    ADD COLUMN "verificationMethod"         TEXT,
    ADD COLUMN "verifiedAt"                 TIMESTAMP(3),
    ADD COLUMN "extendedDeadline"           TIMESTAMP(3),
    ADD COLUMN "holdConflictCheckedAt"      TIMESTAMP(3),
    ADD COLUMN "holdConflictCount"          INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "holdConflictOverrideReason" TEXT,
    ADD COLUMN "deliveredAt"                TIMESTAMP(3),
    ADD COLUMN "deliveryChannel"            TEXT,
    ADD COLUMN "closureReason"              TEXT;

CREATE INDEX "DataSubjectRequest_organizationId_assignedToUserId_idx" ON "DataSubjectRequest"("organizationId", "assignedToUserId");

-- ── DSARReviewItem — the aiR relevance-review unit ───────────────────
CREATE TABLE "DSARReviewItem" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId"      TEXT NOT NULL,
    "sourceSystem"   TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "excerpt"        TEXT,
    "aiVerdict"      "DSARReviewVerdict",
    "aiScore"        DOUBLE PRECISION,
    "aiRationale"    TEXT,
    "reviewDecision" "DSARReviewDecision" NOT NULL DEFAULT 'PENDING',
    "finalRelevant"  BOOLEAN,
    "redact"         BOOLEAN NOT NULL DEFAULT false,
    "redactionNote"  TEXT,
    "reviewedById"   TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DSARReviewItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DSARReviewItem_organizationId_requestId_idx" ON "DSARReviewItem"("organizationId", "requestId");
CREATE INDEX "DSARReviewItem_requestId_reviewDecision_idx" ON "DSARReviewItem"("requestId", "reviewDecision");

ALTER TABLE "DSARReviewItem" ADD CONSTRAINT "DSARReviewItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DSARAccessToken — login-less data-subject access ─────────────────
CREATE TABLE "DSARAccessToken" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId"      TEXT NOT NULL,
    "tokenHash"      TEXT NOT NULL,
    "purpose"        "DSARAccessTokenPurpose" NOT NULL DEFAULT 'STATUS',
    "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "viewedAt"       TIMESTAMP(3),
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DSARAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DSARAccessToken_tokenHash_key" ON "DSARAccessToken"("tokenHash");
CREATE INDEX "DSARAccessToken_organizationId_requestId_idx" ON "DSARAccessToken"("organizationId", "requestId");

ALTER TABLE "DSARAccessToken" ADD CONSTRAINT "DSARAccessToken_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DataSubjectRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
