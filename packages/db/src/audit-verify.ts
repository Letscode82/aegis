/**
 * AuditLog chain verification.
 *
 * Walks every row for an organisation in chainPosition order and:
 *   1. Confirms each row's prevHash matches the previous row's
 *      contentHash (genesis: 64 zero-bytes).
 *   2. Recomputes contentHash via the same SQL function the BEFORE
 *      INSERT trigger uses, and compares to the stored value.
 *
 * Verification delegates hashing to Postgres rather than reproducing
 * JSONB normalisation in TypeScript — the trigger and the verifier
 * share audit_log_compute_hash(), so we get byte-exact parity for
 * free.
 *
 * Off-database verification (court / auditor scenario) is supported
 * via exportAuditDefensibilityReport(), which embeds each row's
 * canonical-content text directly in the JSON output. The auditor
 * hashes that text and compares to the stored contentHash without
 * having to reproduce JSONB normalisation themselves.
 */
import { prisma } from "./client";

export interface ChainBreak {
  organizationId: string;
  chainPosition: bigint;
  rowId: string;
  reason: "PREV_HASH_MISMATCH" | "CONTENT_HASH_MISMATCH";
  details: string;
}

export interface ChainVerificationResult {
  organizationId: string;
  rowsChecked: number;
  intact: boolean;
  breaks: ChainBreak[];
  /** contentHash of the highest-position row in scope, or null if empty. */
  headHash: string | null;
  /** prevHash of the lowest-position row in scope, or null if empty. */
  tailPrevHash: string | null;
  schemaVersion: number;
  verifiedAt: Date;
  elapsedMs: number;
}

interface VerifyRow {
  id: string;
  chainPosition: bigint;
  prevHash: string;
  contentHash: string;
  computedHash: string;
  computedPrev: string | null;
  schemaVersion: number;
}

const GENESIS_PREV = "0".repeat(64);

export async function verifyAuditChain(
  organizationId: string,
): Promise<ChainVerificationResult> {
  const startedAt = Date.now();

  // The window function lets us pull each row's expected prevHash (the
  // previous row's contentHash) in a single round trip. Recomputation
  // of contentHash via the SQL function guarantees parity with the
  // BEFORE INSERT trigger.
  const rows = await prisma.$queryRaw<VerifyRow[]>`
    SELECT
      al."id",
      al."chainPosition",
      al."prevHash",
      al."contentHash",
      al."schemaVersion",
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
  for (const row of rows) {
    const expectedPrev = row.computedPrev ?? GENESIS_PREV;
    if (row.prevHash !== expectedPrev) {
      breaks.push({
        organizationId,
        chainPosition: row.chainPosition,
        rowId: row.id,
        reason: "PREV_HASH_MISMATCH",
        details: `expected prevHash=${expectedPrev.slice(0, 16)}… stored=${row.prevHash.slice(0, 16)}…`,
      });
    }
    if (row.contentHash !== row.computedHash) {
      breaks.push({
        organizationId,
        chainPosition: row.chainPosition,
        rowId: row.id,
        reason: "CONTENT_HASH_MISMATCH",
        details: `recomputed contentHash=${row.computedHash.slice(0, 16)}… stored=${row.contentHash.slice(0, 16)}…`,
      });
    }
  }

  const last = rows[rows.length - 1] ?? null;
  const first = rows[0] ?? null;

  return {
    organizationId,
    rowsChecked: rows.length,
    intact: breaks.length === 0,
    breaks,
    headHash: last ? last.contentHash : null,
    tailPrevHash: first ? first.prevHash : null,
    schemaVersion: rows[0]?.schemaVersion ?? 1,
    verifiedAt: new Date(),
    elapsedMs: Date.now() - startedAt,
  };
}
