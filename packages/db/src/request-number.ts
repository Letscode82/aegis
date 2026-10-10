/**
 * Per-organisation intake request (REQ) numbering.
 *
 * Intake tickets use a human-readable id ("REQ-5001") that doubles as the
 * primary key. Historically the command-bar routes minted it as
 * `"REQ-" + random(5000..9998)` — non-sequential and collision-prone once
 * governed ONE Legal actions started back-filling tickets into the same
 * space. This helper replaces that with a monotonic per-org sequence.
 *
 * Collision safety: the next number is read and the row inserted inside ONE
 * transaction guarded by a per-org `pg_advisory_xact_lock`, so concurrent
 * creates in the same org serialise on the lock and can't mint the same id;
 * different orgs hash to different lock keys and never contend. This mirrors
 * the AuditLog chain's per-org advisory-lock discipline.
 *
 * Raw SQL lives here by design — @aegis/db is the one package permitted to
 * issue it (CLAUDE.md "Data access discipline"). Callers that need the number
 * reserved atomically with their own insert pass their transaction client to
 * `nextRequestNumberInTx` and create the ticket in the same `$transaction`.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./client";

/**
 * New sequential numbers start here, above the demo seed ranges (REQ-34xx /
 * REQ-35xx fixtures, REQ-36xx bulk NDA, REQ-40xx copilot demo) so a fresh
 * org's first governed/filed request reads as REQ-5000, never colliding with
 * seeded ids.
 */
export const REQUEST_NUMBER_BASE = 5000;

/** Deterministic non-negative 31-bit key so a given org always takes the same
 *  advisory lock (and distinct orgs almost always take distinct ones). */
function advisoryLockKey(organizationId: string): number {
  let h = 0;
  for (let i = 0; i < organizationId.length; i++) {
    h = (Math.imul(h, 31) + organizationId.charCodeAt(i)) | 0;
  }
  return h & 0x7fffffff;
}

type Tx = Prisma.TransactionClient;

/**
 * Reserve the next "REQ-<n>" for the org on the given transaction client.
 * MUST be called inside a `prisma.$transaction` and the ticket inserted in
 * that same transaction — the advisory lock is held only for the transaction,
 * so the insert has to ride along for the reservation to be race-free.
 */
export async function nextRequestNumberInTx(
  tx: Tx,
  organizationId: string,
): Promise<string> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(${advisoryLockKey(organizationId)})`,
  );
  const rows = await tx.$queryRaw<Array<{ max: number | null }>>(Prisma.sql`
    SELECT MAX(CAST(substring("id" FROM '^REQ-([0-9]+)$') AS INTEGER)) AS max
    FROM "IntakeTicket"
    WHERE "organizationId" = ${organizationId}
      AND "id" ~ '^REQ-[0-9]+$'
  `);
  const current = rows[0]?.max != null ? Number(rows[0].max) : null;
  const next =
    current != null && current >= REQUEST_NUMBER_BASE
      ? current + 1
      : REQUEST_NUMBER_BASE;
  return `REQ-${next}`;
}

/**
 * Standalone reservation — mints the next number in its own transaction. Use
 * only when the caller inserts the ticket immediately afterward by that exact
 * id (e.g. a chokepoint upsert keyed on it); for a create that can share a
 * transaction, prefer `nextRequestNumberInTx` so the reservation and insert
 * are one atomic step.
 */
export async function assignRequestNumber(organizationId: string): Promise<string> {
  return prisma.$transaction((tx) => nextRequestNumberInTx(tx, organizationId));
}
