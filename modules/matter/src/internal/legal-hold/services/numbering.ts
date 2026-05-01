/**
 * Hold numbering — assigns the org-unique `LH-{YYYY}-{SEQ:4}` id at
 * issue time. DRAFT holds intentionally have null `holdNumber` until
 * promoted to ISSUED.
 *
 * Mirrors `modules/matter/src/internal/services/numbering.ts`. The
 * sequence is computed by counting existing holds for the current
 * year and incrementing — atomic per-row update via Prisma is
 * sufficient because the hold-issue path is gated upstream by the
 * matter:legal_hold:issue permission and never runs at intake-burst
 * scale.
 */
import { prisma } from "@aegis/db";

export async function nextHoldNumber(
  organizationId: string,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `LH-${year}-`;
  // Count existing holds with this year's prefix; new sequence = count + 1.
  // Concurrent issues serialize via Postgres row-level locking on
  // the LegalHold update that sets the number — duplicate detection
  // is the per-(org, holdNumber) unique index.
  const existing = await prisma.legalHold.findMany({
    where: {
      organizationId,
      holdNumber: { startsWith: prefix },
    },
    select: { holdNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    if (!row.holdNumber) continue;
    const tail = row.holdNumber.slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const seq = String(max + 1).padStart(4, "0");
  return `${prefix}${seq}`;
}
