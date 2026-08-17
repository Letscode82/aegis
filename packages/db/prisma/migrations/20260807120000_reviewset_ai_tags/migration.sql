-- AI review on review sets (AIR-3). Additive: the full multi-dimension tag set
-- + routing decision from @aegis/ai-review, persisted per review-set item.
ALTER TABLE "ReviewSetItem"
    ADD COLUMN "aiTags"  JSONB,
    ADD COLUMN "aiRoute" TEXT;
