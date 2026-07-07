-- GC Suite agent contract: risks checklist + playbook stamp on every
-- recommendation. Additive, defaulted.
ALTER TABLE "AgentRecommendation" ADD COLUMN "risksJson" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AgentRecommendation" ADD COLUMN "playbookJson" JSONB;
