-- PR C (Review their paper): persisted graded review + stable clause anchors.
-- Additive: one column (ContractClause.anchorId), two tables, five enums. The
-- anchorId backfill sets each existing clause's anchor to its own id
-- (deterministic given the same starting state); new rows get a cuid from the
-- Prisma app-layer default.

-- Stable clause anchor — add nullable, backfill to id, then enforce NOT NULL.
ALTER TABLE "ContractClause" ADD COLUMN "anchorId" TEXT;
UPDATE "ContractClause" SET "anchorId" = "id" WHERE "anchorId" IS NULL;
ALTER TABLE "ContractClause" ALTER COLUMN "anchorId" SET NOT NULL;
CREATE INDEX "ContractClause_anchorId_idx" ON "ContractClause"("anchorId");

-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "ReviewPaperType" AS ENUM ('THEIR_PAPER', 'OUR_PAPER_THEIR_MARKS'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ContractReviewStatus" AS ENUM ('IN_PROGRESS', 'READY', 'APPLIED', 'EXPORTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "ReviewGrade" AS ENUM ('STANDARD', 'FALLBACK', 'ESCALATE', 'MISSING'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FindingEditKind" AS ENUM ('REPLACEMENT', 'INSERTION', 'DELETION', 'NONE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "FindingDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE "ContractReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "playbookId" TEXT,
    "playbookVersion" INTEGER,
    "paperType" "ReviewPaperType" NOT NULL DEFAULT 'THEIR_PAPER',
    "perspective" "ContractPerspective",
    "status" "ContractReviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "verdict" TEXT,
    "riskBand" TEXT,
    "severitySummaryJson" JSONB,
    "appliedVersionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "clauseAnchorId" TEXT,
    "clauseType" TEXT NOT NULL,
    "grade" "ReviewGrade" NOT NULL,
    "editKind" "FindingEditKind" NOT NULL DEFAULT 'NONE',
    "ourPosition" TEXT,
    "theirPosition" TEXT,
    "rationale" TEXT,
    "suggestedText" TEXT,
    "playbookRuleId" TEXT,
    "severity" INTEGER NOT NULL DEFAULT 0,
    "decision" "FindingDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "agentDecisionId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractReview_organizationId_contractId_idx" ON "ContractReview"("organizationId", "contractId");
CREATE INDEX "ContractReview_contractId_status_idx" ON "ContractReview"("contractId", "status");
CREATE INDEX "ReviewFinding_reviewId_decision_idx" ON "ReviewFinding"("reviewId", "decision");
CREATE INDEX "ReviewFinding_organizationId_grade_idx" ON "ReviewFinding"("organizationId", "grade");

-- AddForeignKey
ALTER TABLE "ContractReview" ADD CONSTRAINT "ContractReview_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewFinding" ADD CONSTRAINT "ReviewFinding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ContractReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
