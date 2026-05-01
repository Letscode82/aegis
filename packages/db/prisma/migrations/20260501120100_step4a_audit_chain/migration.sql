-- Step 4a — AuditLog cryptographic chain (D11).
--
-- This migration is the structural foundation of differentiator #11:
-- a tamper-evident, database-immutable audit ledger that every module
-- writes to. Once this lands, no path through Prisma or raw SQL can
-- mutate or remove an AuditLog row, and any post-hoc tampering breaks
-- the SHA-256 hash chain so the verifier can localise the break.
--
-- Order of operations:
--   1. pgcrypto extension (digest()).
--   2. Canonical-content + hash helper functions (IMMUTABLE).
--   3. Backfill — assign chainPosition / prevHash / contentHash to every
--      pre-existing row in (timestamp, id) order, per organization. Done
--      BEFORE triggers are installed so the backfill itself isn't blocked.
--   4. BEFORE INSERT trigger — computes prevHash, chainPosition,
--      contentHash inside a per-org advisory lock, so concurrent inserts
--      cannot collide.
--   5. BEFORE UPDATE / BEFORE DELETE triggers — raise unconditionally.
--   6. Drop the partial-WHERE on the chainPosition unique index. After
--      backfill every row has chainPosition > 0; a non-partial UNIQUE
--      now also catches accidental zero-writes (which would indicate
--      a trigger-bypass attempt).
--
-- Tamper-detection model. The chain is verified by walking forward
-- from the genesis row, recomputing each row's contentHash, and
-- comparing against the stored value. Any divergence localises the
-- break. The verifier does NOT depend on triggers being intact (an
-- attacker with superuser could disable them) — it only depends on
-- the hashes being consistent with the field values, which is exactly
-- what tampering would break.

-- ════════════════════════════════════════════════════════════════════
-- 1. pgcrypto
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ════════════════════════════════════════════════════════════════════
-- 2. Canonical-content + hash functions
-- ════════════════════════════════════════════════════════════════════
--
-- Canonical-content is a newline-delimited key=value form. We do NOT
-- hash JSONB::text directly because PG normalises JSONB (sorts keys,
-- removes whitespace) but the canonical key=value framing makes the
-- input intent explicit and is portable to any language that needs to
-- recompute the hash off-database (e.g. the JS verifier in @aegis/db).
--
-- Field order is locked. Adding fields requires bumping schemaVersion
-- and writing a v2 canoniciser; the verifier dispatches on
-- schemaVersion.

CREATE OR REPLACE FUNCTION audit_log_canonical_content(
  p_schema_version int,
  p_org_id text,
  p_actor_id text,
  p_actor_type text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_before_json jsonb,
  p_after_json jsonb,
  p_metadata jsonb,
  p_timestamp timestamp,
  p_prev_hash text,
  p_chain_position bigint
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    'v=' || p_schema_version::text || E'\n' ||
    'org=' || p_org_id || E'\n' ||
    'actor=' || COALESCE(p_actor_id, '') || E'\n' ||
    'actor_type=' || p_actor_type || E'\n' ||
    'action=' || p_action || E'\n' ||
    'rtype=' || p_resource_type || E'\n' ||
    'rid=' || p_resource_id || E'\n' ||
    'before=' || COALESCE(p_before_json::text, 'null') || E'\n' ||
    'after=' || COALESCE(p_after_json::text, 'null') || E'\n' ||
    'meta=' || COALESCE(p_metadata::text, 'null') || E'\n' ||
    'ts=' || to_char(p_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US') || E'\n' ||
    'prev=' || p_prev_hash || E'\n' ||
    'pos=' || p_chain_position::text
$$;

CREATE OR REPLACE FUNCTION audit_log_compute_hash(
  p_schema_version int,
  p_org_id text,
  p_actor_id text,
  p_actor_type text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_before_json jsonb,
  p_after_json jsonb,
  p_metadata jsonb,
  p_timestamp timestamp,
  p_prev_hash text,
  p_chain_position bigint
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(
    digest(
      audit_log_canonical_content(
        p_schema_version, p_org_id, p_actor_id, p_actor_type, p_action,
        p_resource_type, p_resource_id, p_before_json, p_after_json,
        p_metadata, p_timestamp, p_prev_hash, p_chain_position
      ),
      'sha256'
    ),
    'hex'
  )
$$;

-- ════════════════════════════════════════════════════════════════════
-- 3. Backfill existing rows
-- ════════════════════════════════════════════════════════════════════
--
-- Walk forward per organisation in (timestamp ASC, id ASC) order,
-- assign chainPosition starting at 1, and compute prevHash + contentHash
-- via a recursive CTE. The genesis row's prevHash is 64 zero-bytes.
--
-- This UPDATE runs while triggers do NOT exist yet — installing the
-- immutability trigger first would block the backfill. Order matters.

WITH RECURSIVE ordered AS (
  SELECT
    al."id",
    al."organizationId",
    al."schemaVersion",
    al."actorId",
    al."actorType",
    al."action",
    al."resourceType",
    al."resourceId",
    al."beforeJson",
    al."afterJson",
    al."metadata",
    al."timestamp",
    ROW_NUMBER() OVER (
      PARTITION BY al."organizationId"
      ORDER BY al."timestamp" ASC, al."id" ASC
    ) AS pos
  FROM "AuditLog" al
),
chain AS (
  -- Genesis row per organisation: prevHash is 64 zero-bytes.
  SELECT
    o.*,
    repeat('0', 64) AS prev_hash,
    audit_log_compute_hash(
      o."schemaVersion", o."organizationId", o."actorId", o."actorType",
      o."action", o."resourceType", o."resourceId",
      o."beforeJson", o."afterJson", o."metadata",
      o."timestamp", repeat('0', 64), o.pos
    ) AS content_hash
  FROM ordered o
  WHERE o.pos = 1

  UNION ALL

  -- Walk forward inside each organisation. The recursive step joins
  -- the *next* row to the previous chain row's content_hash.
  SELECT
    o.*,
    c.content_hash AS prev_hash,
    audit_log_compute_hash(
      o."schemaVersion", o."organizationId", o."actorId", o."actorType",
      o."action", o."resourceType", o."resourceId",
      o."beforeJson", o."afterJson", o."metadata",
      o."timestamp", c.content_hash, o.pos
    ) AS content_hash
  FROM ordered o
  JOIN chain c
    ON c."organizationId" = o."organizationId"
   AND o.pos = c.pos + 1
)
UPDATE "AuditLog" al
SET
  "prevHash"      = chain.prev_hash,
  "contentHash"   = chain.content_hash,
  "chainPosition" = chain.pos
FROM chain
WHERE al."id" = chain."id";

-- ════════════════════════════════════════════════════════════════════
-- 4. Tighten the chainPosition unique index
-- ════════════════════════════════════════════════════════════════════
--
-- The structural migration created the index with a partial WHERE
-- "chainPosition" > 0 so the all-zero default did not collide pre-backfill.
-- Now every row has a proper position; replace with a non-partial unique
-- so any future zero-write (i.e. trigger bypass) collides loudly.

DROP INDEX IF EXISTS "AuditLog_organizationId_chainPosition_key";
CREATE UNIQUE INDEX "AuditLog_organizationId_chainPosition_key"
  ON "AuditLog"("organizationId", "chainPosition");

-- ════════════════════════════════════════════════════════════════════
-- 5. BEFORE INSERT trigger — chain the new row
-- ════════════════════════════════════════════════════════════════════
--
-- Per-organisation advisory lock serialises concurrent inserts so two
-- transactions cannot read the same MAX(chainPosition) and write
-- conflicting positions. The lock auto-releases at transaction end.

CREATE OR REPLACE FUNCTION audit_log_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key bigint;
  v_prev_pos bigint;
  v_prev_hash text;
BEGIN
  -- hashtextextended is deterministic and returns bigint — perfect
  -- input for pg_advisory_xact_lock. Salt 0 is fine; we don't share
  -- this lock space with anything else.
  v_lock_key := hashtextextended(NEW."organizationId", 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Pull the latest row's position + hash for this org. ORDER BY
  -- chainPosition DESC + LIMIT 1 is the deterministic source of truth.
  SELECT "chainPosition", "contentHash"
    INTO v_prev_pos, v_prev_hash
  FROM "AuditLog"
  WHERE "organizationId" = NEW."organizationId"
  ORDER BY "chainPosition" DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- First row for this organisation.
    v_prev_pos := 0;
    v_prev_hash := repeat('0', 64);
  END IF;

  -- Apps cannot influence these — even if Prisma sends defaults, we
  -- overwrite. This is what makes tampering on insert impossible.
  NEW."chainPosition" := v_prev_pos + 1;
  NEW."prevHash" := v_prev_hash;
  NEW."contentHash" := audit_log_compute_hash(
    NEW."schemaVersion",
    NEW."organizationId",
    NEW."actorId",
    NEW."actorType",
    NEW."action",
    NEW."resourceType",
    NEW."resourceId",
    NEW."beforeJson",
    NEW."afterJson",
    NEW."metadata",
    NEW."timestamp",
    NEW."prevHash",
    NEW."chainPosition"
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_chain_insert
  BEFORE INSERT ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_before_insert();

-- ════════════════════════════════════════════════════════════════════
-- 6. Immutability — block UPDATE and DELETE
-- ════════════════════════════════════════════════════════════════════
--
-- Append-only is structural. A cryptographic chain catches tampering
-- after the fact; the trigger catches the casual "I'll just fix this
-- one row" mistake before it happens. Both layers ship.

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'AuditLog is append-only and cryptographically chained. % is forbidden.',
    TG_OP
    USING
      ERRCODE = 'check_violation',
      HINT = 'Audit rows record what happened. Do not mutate them. Add a corrective audit row instead.';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_immutable();

-- ════════════════════════════════════════════════════════════════════
-- Notes for future migrations
-- ════════════════════════════════════════════════════════════════════
--
-- - To bump schemaVersion: write a new migration that inserts a single
--   "schema.audit.v2" pivot row per organisation (which seals the v1
--   subchain), then update audit_log_canonical_content to dispatch on
--   the version argument. The JS verifier needs the same dispatch.
--
-- - To rotate the canonical form for a given version: don't. Bump the
--   version. The whole point of the schemaVersion field is so you
--   never have to invalidate prior chain segments.
--
-- - To drop the triggers: don't. If a tenant cannot be on a database
--   that supports pgcrypto, that's a hard incompatibility — they
--   cannot host AEGIS data without the chain. Document accordingly.
