-- Sub-PR 4d.0 — per-data-source preservation lifecycle.
--
-- Adds `DataSourcePreservationStatus` enum + `preservationStatus`
-- column on `CustodianDataSource` so the hold workspace can render
-- per-source colored badges (Pending / On Hold / Error / Released)
-- and offer a one-click retry on ERROR rows.
--
-- Existing rows backfill from the legacy timestamps:
--   * preservationConfirmedAt set     → ON_HOLD
--   * preservationFailureReason set   → ERROR
--   * preservationAppliedAt set       → PENDING (sent but not confirmed)
--   * everything else                 → NOT_REQUESTED
-- Released rows are a future state — this migration doesn't try to
-- guess them; the release flow will set RELEASED going forward.

CREATE TYPE "DataSourcePreservationStatus" AS ENUM (
    'NOT_REQUESTED',
    'PENDING',
    'ON_HOLD',
    'ERROR',
    'RELEASED'
);

ALTER TABLE "CustodianDataSource"
    ADD COLUMN "preservationStatus" "DataSourcePreservationStatus" NOT NULL DEFAULT 'NOT_REQUESTED';

UPDATE "CustodianDataSource"
SET "preservationStatus" = 'ON_HOLD'
WHERE "preservationConfirmedAt" IS NOT NULL
  AND "preservationFailureReason" IS NULL;

UPDATE "CustodianDataSource"
SET "preservationStatus" = 'ERROR'
WHERE "preservationFailureReason" IS NOT NULL;

UPDATE "CustodianDataSource"
SET "preservationStatus" = 'PENDING'
WHERE "preservationAppliedAt" IS NOT NULL
  AND "preservationConfirmedAt" IS NULL
  AND "preservationFailureReason" IS NULL;
