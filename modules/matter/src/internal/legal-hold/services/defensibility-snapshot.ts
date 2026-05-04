/**
 * Defensibility score snapshots (sub-PR 4c.5, Item 15).
 *
 * Two write paths and two read paths:
 *
 *   write — `recordDefensibilitySnapshot(holdId)` computes the
 *           current score and writes one HoldDefensibilityScoreSnapshot
 *           row. Called from:
 *             - the daily pg-boss recurring job (every active hold)
 *             - score-affecting mutations via `recordHoldEvent` so
 *               the trend captures real-time changes (custodian
 *               add/ack/release, preservation apply/confirm,
 *               notice issued, scope amended, etc.)
 *
 *   write — `pruneOldSnapshots(orgId)` runs weekly. Keeps every
 *           daily snapshot for the last 90 days; thins older
 *           snapshots to one per ISO week (the latest in the week
 *           wins). Long-term storage stays bounded.
 *
 *   read  — `listHoldSnapshots(holdId, opts)` returns rows in
 *           chronological order. The sparkline takes the most-recent
 *           N points; the trend modal pulls the full series.
 *
 *   read  — `getHoldSnapshotComponentSeries(holdId)` returns the
 *           per-component time-series the trend modal's
 *           component-level chart renders.
 *
 * `componentsJson` mirrors the structured component shape from
 * `HoldDefensibilityScore.components` so the trend export schema
 * stays parseable by v2 readers (each component value is `number |
 * null`, weight unchanged).
 */
import { prisma } from "@aegis/db";
import { getHoldDefensibilityScoreService } from "./defensibility";

export interface HoldSnapshotDTO {
  id: string;
  computedAt: string;
  score: number;
  gapCount: number;
  components: Record<
    string,
    {
      value: number | null;
      weight: number;
      gap: string | null;
      notApplicableReason?: string | null;
    }
  >;
}

/**
 * Compute the current defensibility score for a hold and persist it
 * as a snapshot. Returns the snapshot row.
 *
 * Idempotency: callers can safely fire this multiple times in quick
 * succession — the snapshots table is append-only by design (the
 * trend reflects every recompute). The recurring job dedupes by
 * checking whether a snapshot already exists for the same UTC day,
 * and skips when one does.
 */
export async function recordDefensibilitySnapshotService(
  holdId: string,
): Promise<HoldSnapshotDTO> {
  const score = await getHoldDefensibilityScoreService(holdId);
  const created = await prisma.holdDefensibilityScoreSnapshot.create({
    data: {
      legalHoldId: holdId,
      score: score.score,
      componentsJson: score.components as unknown as object,
      gapCount: score.gaps.length,
    },
  });
  return {
    id: created.id,
    computedAt: created.computedAt.toISOString(),
    score: created.score,
    gapCount: created.gapCount,
    components: score.components,
  };
}

/**
 * Read snapshots for one hold, oldest-first by default.
 *
 * Options:
 *   - `limit`: cap the result count (sparkline uses 30, trend modal
 *     uses everything).
 *   - `since` / `until`: ISO date bounds for the trend modal's date
 *     picker.
 */
export interface ListSnapshotsOptions {
  limit?: number;
  since?: Date;
  until?: Date;
}

export async function listHoldSnapshotsService(
  holdId: string,
  opts: ListSnapshotsOptions = {},
): Promise<HoldSnapshotDTO[]> {
  const rows = await prisma.holdDefensibilityScoreSnapshot.findMany({
    where: {
      legalHoldId: holdId,
      ...(opts.since || opts.until
        ? {
            computedAt: {
              ...(opts.since ? { gte: opts.since } : {}),
              ...(opts.until ? { lte: opts.until } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ computedAt: "asc" }],
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  return rows.map((r) => ({
    id: r.id,
    computedAt: r.computedAt.toISOString(),
    score: r.score,
    gapCount: r.gapCount,
    components:
      (r.componentsJson as unknown as HoldSnapshotDTO["components"]) ?? {},
  }));
}

/**
 * Retention cleanup: keep every daily snapshot from the last 90
 * days at the original resolution; thin older snapshots to one per
 * ISO week (the latest snapshot in the week wins, the others get
 * deleted). Called by the weekly cleanup job.
 *
 * Returns the number of rows deleted so the job log is honest about
 * what happened.
 */
export async function pruneOldSnapshotsService(
  organizationId: string,
): Promise<{ deletedCount: number }> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);

  // Find candidate rows (older than the 90-day window) for every
  // hold in the org. We scope to org so a multi-tenant cleanup
  // operator can run per-tenant.
  const candidates = await prisma.holdDefensibilityScoreSnapshot.findMany({
    where: {
      computedAt: { lt: cutoff },
      legalHold: { organizationId },
    },
    select: { id: true, legalHoldId: true, computedAt: true },
    orderBy: [{ legalHoldId: "asc" }, { computedAt: "asc" }],
  });
  if (candidates.length === 0) return { deletedCount: 0 };

  // Group by (holdId, isoWeek). Within each group, keep the LATEST
  // snapshot; collect everything else for deletion.
  const keep = new Map<string, { id: string; ts: number }>();
  const toDelete: string[] = [];
  for (const r of candidates) {
    const key = `${r.legalHoldId}:${isoWeek(r.computedAt)}`;
    const ts = r.computedAt.getTime();
    const cur = keep.get(key);
    if (!cur) {
      keep.set(key, { id: r.id, ts });
    } else if (ts > cur.ts) {
      // The new row is later — keep it, schedule the previous
      // winner for deletion.
      toDelete.push(cur.id);
      keep.set(key, { id: r.id, ts });
    } else {
      toDelete.push(r.id);
    }
  }
  if (toDelete.length === 0) return { deletedCount: 0 };
  await prisma.holdDefensibilityScoreSnapshot.deleteMany({
    where: { id: { in: toDelete } },
  });
  return { deletedCount: toDelete.length };
}

/**
 * ISO week key — `YYYY-Www` style — used as the bucket id for
 * retention thinning.
 */
export function isoWeek(d: Date): string {
  // Copy then move Thursday in this week. Per ISO 8601, the year of
  // the week is the year of the Thursday.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
