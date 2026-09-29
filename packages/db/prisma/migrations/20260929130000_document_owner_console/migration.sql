-- B2 — ONE Legal "upload & analyze". Documents dropped into the console for
-- analysis are persisted as first-class Document rows (so they join the "one
-- brain" and are citable by the K1 semantic layer) but aren't yet attached to a
-- matter. New owner category for that state. Additive enum value only.
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'CONSOLE';
