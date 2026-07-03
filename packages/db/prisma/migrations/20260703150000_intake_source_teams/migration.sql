-- W3-1: Microsoft Teams intake channel. Additive enum value; the new
-- value is not used inside this migration (PG12+ transactional rule).
ALTER TYPE "IntakeSource" ADD VALUE 'TEAMS';
