/**
 * AuditLog chain canary.
 *
 * Walks every AuditLog row in chainPosition order, per organization,
 * and verifies:
 *
 *   1. prevHash equals the previous row's contentHash (or 64 zero-bytes
 *      for the genesis row).
 *   2. contentHash equals what the database's IMMUTABLE
 *      audit_log_compute_hash() function recomputes from the row's
 *      stored fields.
 *
 * On any divergence, exits non-zero with a per-row report of where the
 * chain broke. Cheap insurance against future schema changes that
 * might silently invalidate previously-sealed rows — wire this into CI
 * so a migration that breaks the chain fails the build.
 *
 * Why we delegate hashing to Postgres rather than recomputing in TS:
 * the trigger and the canary share the same SQL function (defined in
 * the audit-chain migration), so we get byte-exact parity without
 * having to reproduce JSONB normalisation rules in JavaScript.
 *
 * Run via:
 *   DATABASE_URL=... pnpm --filter @aegis/db exec tsx scripts/audit-canary.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface OrgRow {
  organizationId: string;
  rowCount: bigint;
}

interface VerifyRow {
  id: string;
  chainPosition: bigint;
  prevHash: string;
  contentHash: string;
  computedHash: string;
  computedPrev: string | null;
}

interface ChainBreak {
  organizationId: string;
  chainPosition: bigint;
  rowId: string;
  reason: string;
}

async function listOrgsWithAuditRows(): Promise<OrgRow[]> {
  return prisma.$queryRaw<OrgRow[]>`
    SELECT "organizationId", COUNT(*)::bigint AS "rowCount"
    FROM "AuditLog"
    GROUP BY "organizationId"
    ORDER BY "organizationId" ASC
  `;
}

async function verifyOrgChain(organizationId: string): Promise<{
  rows: number;
  breaks: ChainBreak[];
}> {
  // Recompute each row's contentHash via the same SQL function the
  // BEFORE INSERT trigger uses, and pull the previous row's contentHash
  // via LAG() so we can validate prevHash linkage in one round trip.
  const rows = await prisma.$queryRaw<VerifyRow[]>`
    SELECT
      al."id",
      al."chainPosition",
      al."prevHash",
      al."contentHash",
      audit_log_compute_hash(
        al."schemaVersion", al."organizationId", al."actorId", al."actorType",
        al."action", al."resourceType", al."resourceId",
        al."beforeJson", al."afterJson", al."metadata",
        al."timestamp", al."prevHash", al."chainPosition"
      ) AS "computedHash",
      LAG(al."contentHash") OVER (
        PARTITION BY al."organizationId"
        ORDER BY al."chainPosition" ASC
      ) AS "computedPrev"
    FROM "AuditLog" al
    WHERE al."organizationId" = ${organizationId}
    ORDER BY al."chainPosition" ASC
  `;

  const breaks: ChainBreak[] = [];
  const GENESIS_PREV = "0".repeat(64);

  for (const row of rows) {
    const expectedPrev = row.computedPrev ?? GENESIS_PREV;
    if (row.prevHash !== expectedPrev) {
      breaks.push({
        organizationId,
        chainPosition: row.chainPosition,
        rowId: row.id,
        reason: `prevHash mismatch: stored=${row.prevHash.slice(0, 12)}… expected=${expectedPrev.slice(0, 12)}…`,
      });
    }
    if (row.contentHash !== row.computedHash) {
      breaks.push({
        organizationId,
        chainPosition: row.chainPosition,
        rowId: row.id,
        reason: `contentHash mismatch: stored=${row.contentHash.slice(0, 12)}… recomputed=${row.computedHash.slice(0, 12)}…`,
      });
    }
  }

  return { rows: rows.length, breaks };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const orgs = await listOrgsWithAuditRows();

  let totalRows = 0;
  const allBreaks: ChainBreak[] = [];

  for (const o of orgs) {
    const { rows, breaks } = await verifyOrgChain(o.organizationId);
    totalRows += rows;
    allBreaks.push(...breaks);
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[audit-canary] orgs=${orgs.length} rows=${totalRows} breaks=${allBreaks.length} elapsed=${elapsedMs}ms`,
  );

  if (allBreaks.length > 0) {
    console.error("[audit-canary] CHAIN INTEGRITY FAILURE:");
    for (const b of allBreaks) {
      console.error(
        `  org=${b.organizationId} pos=${b.chainPosition} id=${b.rowId} :: ${b.reason}`,
      );
    }
    process.exit(1);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error("[audit-canary] failed:", err);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
