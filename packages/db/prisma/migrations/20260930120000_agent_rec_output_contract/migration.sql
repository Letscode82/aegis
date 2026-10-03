-- SK-4 — converge the eleven intake agents onto the AEGIS shared output
-- contract (@aegis/legal-skills). Additive: two nullable/default columns on
-- AgentRecommendation so every recommendation carries a severity on the one
-- S1–S4/Info scale (and the structured findings when an agent produced them).
-- No existing column is touched; deployed rows keep working (overallSeverity
-- NULL = not assessed, findingsJson defaults to []).

ALTER TABLE "AgentRecommendation" ADD COLUMN IF NOT EXISTS "overallSeverity" TEXT;
ALTER TABLE "AgentRecommendation" ADD COLUMN IF NOT EXISTS "findingsJson" JSONB NOT NULL DEFAULT '[]';
