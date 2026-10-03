-- SK-7 — admin-editable ONE Legal skills (org-authored playbooks) behind the
-- same E1 shape as the built-in catalog. Additive: one new table, no existing
-- table touched. organizationId is a plain scalar (localized pattern, same as
-- ConsoleSession), so there is no cross-table migration.

CREATE TABLE IF NOT EXISTS "Skill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '✦',
    "action" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cats" JSONB NOT NULL DEFAULT '[]',
    "reviewSkillId" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Skill_organizationId_slug_key" ON "Skill"("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "Skill_organizationId_category_idx" ON "Skill"("organizationId", "category");
