-- Review sets (persisted eDiscovery / DSAR collections). Additive.
-- A ReviewSet is a frozen-able collection of records from a Purview content
-- collection; ReviewSetItem is the per-record coding unit for the reviewer
-- console. Provenance links (legalHoldId / matterId / dataSubjectRequestId)
-- are plain scalars; cascade flows through organizationId / the reviewSet FK.

CREATE TYPE "ReviewSetOrigin" AS ENUM ('LEGAL_HOLD', 'DSAR', 'MANUAL');
CREATE TYPE "ReviewSetStatus" AS ENUM ('OPEN', 'FROZEN', 'PRODUCED');

CREATE TABLE "ReviewSet" (
    "id"                   TEXT NOT NULL,
    "organizationId"       TEXT NOT NULL,
    "origin"               "ReviewSetOrigin" NOT NULL,
    "status"               "ReviewSetStatus" NOT NULL DEFAULT 'OPEN',
    "name"                 TEXT NOT NULL,
    "queryString"          TEXT NOT NULL,
    "sources"              TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legalHoldId"          TEXT,
    "matterId"             TEXT,
    "dataSubjectRequestId" TEXT,
    "custodianCount"       INTEGER NOT NULL DEFAULT 0,
    "simulated"            BOOLEAN NOT NULL DEFAULT false,
    "frozenAt"             TIMESTAMP(3),
    "producedAt"           TIMESTAMP(3),
    "createdById"          TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewSet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewSet_organizationId_origin_idx" ON "ReviewSet"("organizationId", "origin");
CREATE INDEX "ReviewSet_legalHoldId_idx" ON "ReviewSet"("legalHoldId");
CREATE INDEX "ReviewSet_dataSubjectRequestId_idx" ON "ReviewSet"("dataSubjectRequestId");

ALTER TABLE "ReviewSet" ADD CONSTRAINT "ReviewSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReviewSetItem" (
    "id"              TEXT NOT NULL,
    "organizationId"  TEXT NOT NULL,
    "reviewSetId"     TEXT NOT NULL,
    "sourceType"      TEXT NOT NULL,
    "sourceSystem"    TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "excerpt"         TEXT,
    "graphId"         TEXT,
    "webUrl"          TEXT,
    "aiVerdict"       "DSARReviewVerdict",
    "aiScore"         DOUBLE PRECISION,
    "aiRationale"     TEXT,
    "reviewDecision"  "DSARReviewDecision" NOT NULL DEFAULT 'PENDING',
    "codedResponsive" BOOLEAN,
    "codedPrivileged" BOOLEAN NOT NULL DEFAULT false,
    "redact"          BOOLEAN NOT NULL DEFAULT false,
    "reviewNote"      TEXT,
    "reviewedById"    TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewSetItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewSetItem_organizationId_reviewSetId_idx" ON "ReviewSetItem"("organizationId", "reviewSetId");
CREATE INDEX "ReviewSetItem_reviewSetId_reviewDecision_idx" ON "ReviewSetItem"("reviewSetId", "reviewDecision");

ALTER TABLE "ReviewSetItem" ADD CONSTRAINT "ReviewSetItem_reviewSetId_fkey" FOREIGN KEY ("reviewSetId") REFERENCES "ReviewSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
