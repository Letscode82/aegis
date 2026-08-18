-- Reviewer-parity v1. Additive: review criteria + issue codes on the set, and
-- a richer per-item coding layout (issues / confidentiality / privilege basis).
ALTER TABLE "ReviewSet"
    ADD COLUMN "criteria"   TEXT,
    ADD COLUMN "issuesJson" JSONB;

ALTER TABLE "ReviewSetItem"
    ADD COLUMN "codingJson" JSONB;
