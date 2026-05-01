-- Step 4a — Matter.status default flip to 'DRAFT'.
--
-- This migration exists solely to defer the column-default flip past
-- the transaction boundary of step4a_matter_schema. Postgres rejects
-- "ALTER COLUMN ... SET DEFAULT 'DRAFT'" in the same transaction that
-- "ALTER TYPE MatterStatus ADD VALUE 'DRAFT'" was issued in:
--
--   ERROR:  unsafe use of new value "DRAFT" of enum type "MatterStatus"
--   HINT:   New enum values must be committed before they can be used.
--
-- Each Prisma migration file runs in its own transaction. Splitting
-- the default flip into this follow-on file lets the enum addition
-- commit first, and the default flip only references a value that
-- already exists at run time.
--
-- Existing seeded rows keep whatever status they already carried —
-- this changes only the column's *default*, never row data.

ALTER TABLE "Matter" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
