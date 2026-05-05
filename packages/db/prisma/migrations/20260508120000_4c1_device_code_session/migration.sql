-- Sub-PR 4c.1 follow-up — DB-backed Device Code OAuth sessions.
--
-- The 4c.1 implementation stored sessions in a `Map<sessionId, …>` in
-- module scope. On Vercel that broke spectacularly: /initiate hits
-- instance A, /poll requests round-robin across every instance, the
-- one that receives Microsoft's authorized response has no session
-- row to update, tokens are silently discarded, and the admin UI
-- stays at NOT CONNECTED forever even after the user signs in
-- successfully.
--
-- Persisting the session row in Postgres makes the flow stateless
-- across instances: any poll can read the long opaque device_code
-- from the row and ask Microsoft's /token endpoint for tokens. First
-- poll to succeed writes tokens to OrganizationM365Credential and
-- flips status='completed' in a single transaction.
--
-- Migration is purely additive (new table only). Old in-memory
-- sessions can't survive the deploy anyway — the user will simply
-- click Connect again and the new path takes over.

CREATE TABLE "M365DeviceCodeSession" (
    "id"                TEXT NOT NULL,
    "organizationId"    TEXT NOT NULL,
    "initiatedById"     TEXT NOT NULL,
    "deviceCode"        TEXT NOT NULL,
    "userCode"          TEXT NOT NULL,
    "verificationUri"   TEXT NOT NULL,
    "expiresAt"         TIMESTAMP(3) NOT NULL,
    "pollIntervalSec"   INTEGER NOT NULL DEFAULT 5,
    "msalCacheJson"     TEXT,
    "status"            TEXT NOT NULL DEFAULT 'pending',
    "completedAt"       TIMESTAMP(3),
    "accountUpn"        TEXT,
    "scopesGrantedJson" JSONB NOT NULL DEFAULT '[]'::JSONB,
    "errorMessage"      TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "M365DeviceCodeSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "M365DeviceCodeSession_organizationId_status_idx"
    ON "M365DeviceCodeSession"("organizationId", "status");

CREATE INDEX "M365DeviceCodeSession_expiresAt_idx"
    ON "M365DeviceCodeSession"("expiresAt");

ALTER TABLE "M365DeviceCodeSession"
    ADD CONSTRAINT "M365DeviceCodeSession_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "M365DeviceCodeSession"
    ADD CONSTRAINT "M365DeviceCodeSession_initiatedById_fkey"
    FOREIGN KEY ("initiatedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
