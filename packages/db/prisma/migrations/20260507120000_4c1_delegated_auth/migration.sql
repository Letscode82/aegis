-- Sub-PR 4c.1 — eDiscovery delegated authentication.
--
-- Microsoft's Graph eDiscovery endpoints (`/security/cases/...`) do not
-- honor application-permissions tokens — confirmed via Microsoft Q&A
-- late 2025/early 2026. The documented workaround all incumbents use
-- (Mitratech, Relativity, Exterro) is delegated authentication backed
-- by a dedicated M365 service account.
--
-- This migration adds the per-org delegated-token storage to the
-- existing `OrganizationM365Credential` row. The refresh token is
-- encrypted at rest using the same v1 prefix pattern as
-- `encryptedClientSecret`. Sunset (KMS migration) is unchanged.
--
-- All columns nullable. Existing rows continue to function with
-- app-only auth for the 5 non-eDiscovery Graph methods; eDiscovery
-- methods fail-loud with `M365DelegatedAuthRequiredError` in
-- production until an admin authorizes via /admin/m365.

ALTER TABLE "OrganizationM365Credential"
  ADD COLUMN "delegatedRefreshToken"     BYTEA,
  ADD COLUMN "delegatedAccountUpn"       TEXT,
  ADD COLUMN "delegatedAuthorizedAt"     TIMESTAMP(3),
  ADD COLUMN "delegatedAuthorizedById"   TEXT,
  ADD COLUMN "delegatedTokenExpiresAt"   TIMESTAMP(3),
  ADD COLUMN "delegatedLastRefreshedAt"  TIMESTAMP(3),
  ADD COLUMN "delegatedLastRefreshError" TEXT,
  ADD COLUMN "delegatedScopesGranted"    TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
