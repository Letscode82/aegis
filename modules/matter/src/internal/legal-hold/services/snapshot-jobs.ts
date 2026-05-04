/**
 * Snapshot job orchestration (sub-PR 4c.5, Item 15).
 *
 * Two recurring jobs:
 *   1. `runDailySnapshotPass(orgId)` — iterate every ACTIVE hold in
 *      the org, write one snapshot per. Dedupes against UTC day so
 *      two runs in the same day don't double-up.
 *   2. `runWeeklyCleanupPass(orgId)` — call pruneOldSnapshots,
 *      thinning >90-day rows to one-per-ISO-week.
 *
 * Trigger surface: today these are exposed as admin HTTP routes
 * (POST /api/admin/jobs/defensibility-{snapshot,cleanup}) so a
 * cron-style scheduler (Vercel Cron, GitHub Actions, internal
 * pg-boss worker, …) can hit them without an active long-running
 * process. The service shape is pg-boss-ready — when the worker
 * runtime lands, both jobs become pg-boss `schedule()` registrations
 * pointing at the same service functions; no caller move.
 *
 * Documented in CLAUDE.md: "first pg-boss recurring job pattern"
 * exception note covers the deferred runtime.
 */
import { prisma } from "@aegis/db";
import {
  recordDefensibilitySnapshotService,
  pruneOldSnapshotsService,
} from "./defensibility-snapshot";

export interface DailySnapshotPassResult {
  organizationId: string;
  attempted: number;
  written: number;
  skipped: number;
  errors: Array<{ holdId: string; error: string }>;
}

/**
 * One snapshot per ACTIVE hold. Dedupes against UTC day — if a
 * snapshot already exists for the same hold + same UTC day, the
 * write is skipped (the recurring job is idempotent).
 *
 * Errors on individual holds are collected, not thrown — one bad
 * hold shouldn't stop the whole pass. The caller logs the result.
 */
export async function runDailySnapshotPass(
  organizationId: string,
): Promise<DailySnapshotPassResult> {
  const holds = await prisma.legalHold.findMany({
    where: {
      organizationId,
      status: { in: ["DRAFT", "ISSUED", "ACTIVE", "PARTIALLY_RELEASED"] },
    },
    select: { id: true },
  });
  const result: DailySnapshotPassResult = {
    organizationId,
    attempted: 0,
    written: 0,
    skipped: 0,
    errors: [],
  };

  const startOfDay = startOfUtcDay(new Date());
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  for (const h of holds) {
    result.attempted += 1;
    try {
      const existing = await prisma.holdDefensibilityScoreSnapshot.findFirst({
        where: {
          legalHoldId: h.id,
          computedAt: { gte: startOfDay, lt: endOfDay },
        },
        select: { id: true },
      });
      if (existing) {
        result.skipped += 1;
        continue;
      }
      await recordDefensibilitySnapshotService(h.id);
      result.written += 1;
    } catch (err) {
      result.errors.push({ holdId: h.id, error: String(err) });
    }
  }
  return result;
}

export async function runWeeklyCleanupPass(
  organizationId: string,
): Promise<{ deletedCount: number }> {
  return pruneOldSnapshotsService(organizationId);
}

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}
