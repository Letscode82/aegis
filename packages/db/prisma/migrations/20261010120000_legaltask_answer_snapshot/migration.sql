-- OL-5 — reopenable ONE Legal history. Additive: one nullable TEXT column on
-- LegalTask holding the displayable answer body captured when a task
-- completed, so a past ask / deep-review / document analysis can be reopened
-- read-only from the console's Recent list (ChatGPT/Claude-style). No existing
-- row is touched (column defaults to NULL), no FK, no AuditLog impact.

-- AlterTable
ALTER TABLE "LegalTask" ADD COLUMN IF NOT EXISTS "answerSnapshot" TEXT;
