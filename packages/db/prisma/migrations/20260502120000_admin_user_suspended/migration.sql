-- Admin module — User soft-suspend column.
--
-- Adds User.suspendedAt as a soft-delete marker. The User row stays
-- intact so AuditLog references (actorId) stay resolvable, but
-- @aegis/auth/server.getResolvedUser refuses to return a User whose
-- suspendedAt is non-null, so suspended users cannot authenticate.
-- Reactivation clears the column.

ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
