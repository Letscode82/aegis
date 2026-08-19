-- RC-4: hub-initiated collections — internal investigations and ad-hoc culling.
-- Additive enum values (Postgres ADD VALUE; safe, non-transactional on Neon).
ALTER TYPE "ReviewSetOrigin" ADD VALUE IF NOT EXISTS 'INVESTIGATION';
ALTER TYPE "ReviewSetOrigin" ADD VALUE IF NOT EXISTS 'ADHOC';
