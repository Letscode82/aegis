/**
 * The scheduled job catalog (F-6).
 *
 * Each entry wraps one of the platform's existing, idempotent "pg-boss-ready"
 * all-org passes behind a `(name, cron, run)` triple. The worker runtime
 * (`runtime.ts`) registers every entry with pg-boss so a single long-running
 * process drives them on their cadence — replacing the external Vercel Cron /
 * manual-admin-trigger fallback the services shipped with.
 *
 * The passes themselves are unchanged and still reachable via their HTTP
 * trigger routes; this module only schedules them. All crons are UTC.
 */
import { prisma } from "@aegis/db";
import { runAllOrgContractSweeps, runAllOrgContractDigests } from "@aegis/contracts";
import { runAllOrgDsarSlaSweeps } from "@aegis/privacy";
import { runDailySnapshotPass, runWeeklyCleanupPass } from "@aegis/matter";
import { evaluateSlaBreaches } from "@aegis/intake/sla";

/** One scheduled job: a pg-boss queue name, a UTC cron, and the pass to run. */
export interface WorkerJob {
  /** pg-boss queue name (kebab-case, stable — it keys the schedule row). */
  readonly name: string;
  /** UTC cron expression (5-field). */
  readonly cron: string;
  /** Human-readable description for logs / docs. */
  readonly description: string;
  /** Run the pass once. Returns a structured summary for the run log. */
  run(): Promise<unknown>;
}

export interface AllOrgPassResult {
  orgs: number;
  ran: number;
  failed: number;
  results: Array<{ organizationId: string; error?: string; [k: string]: unknown }>;
  generatedAt: string;
}

/**
 * Run a per-org pass across every organisation, isolating failures so one
 * org throwing never aborts the batch — the same shape the contracts /
 * privacy all-org wrappers already use, applied here to the per-org matter
 * and intake passes that don't ship their own all-org entry point.
 */
export async function runPerOrg(
  fn: (organizationId: string) => Promise<object>,
): Promise<AllOrgPassResult> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  const results: AllOrgPassResult["results"] = [];
  let failed = 0;
  for (const o of orgs) {
    try {
      results.push({ organizationId: o.id, ...((await fn(o.id)) as Record<string, unknown>) });
    } catch (err) {
      failed += 1;
      results.push({ organizationId: o.id, error: String((err as Error)?.message || err) });
    }
  }
  return {
    orgs: orgs.length,
    ran: orgs.length - failed,
    failed,
    results,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * The scheduled jobs. Cadences mirror the existing Vercel Cron entries in
 * `vercel.json` (contract sweeps, contract digest, DSAR SLA) and the
 * documented cadences for the matter defensibility snapshot/cleanup and the
 * intake SLA scan.
 */
export const WORKER_JOBS: readonly WorkerJob[] = [
  {
    name: "contract-sweeps",
    cron: "0 7 * * *", // daily 07:00 UTC
    description: "Arm renewal-notice obligations and flip overdue obligations to BREACHED, all orgs.",
    run: () => runAllOrgContractSweeps(),
  },
  {
    name: "contract-digest",
    cron: "0 8 * * 1", // weekly Monday 08:00 UTC
    description: "Email each org's leadership the weekly actionable-contract digest.",
    run: () => runAllOrgContractDigests(),
  },
  {
    name: "dsar-sla-sweep",
    cron: "0 6 * * *", // daily 06:00 UTC
    description: "Flag every open DSAR past its statutory/extended deadline (privacy.dsar.sla_breached).",
    run: () => runAllOrgDsarSlaSweeps(),
  },
  {
    name: "defensibility-snapshot",
    cron: "30 6 * * *", // daily 06:30 UTC
    description: "Capture a daily defensibility-score snapshot per active legal hold, all orgs.",
    run: () => runPerOrg((orgId) => runDailySnapshotPass(orgId)),
  },
  {
    name: "defensibility-cleanup",
    cron: "0 9 * * 1", // weekly Monday 09:00 UTC
    description: "Thin defensibility snapshots older than 90 days to one per ISO week, all orgs.",
    run: () => runPerOrg((orgId) => runWeeklyCleanupPass(orgId)),
  },
  {
    name: "intake-sla-scan",
    cron: "0 * * * *", // hourly
    description: "Escalate intake tickets past their SLA (status → ESCALATED) with audit rows, all orgs.",
    run: () => runPerOrg((orgId) => evaluateSlaBreaches(orgId)),
  },
];
