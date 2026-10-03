/**
 * Worker runtime (F-6) — registers the job catalog with a pg-boss-like
 * scheduler. Kept independent of the concrete `pg-boss` import so it can be
 * unit-tested with a fake scheduler (no Postgres, no library).
 */
import type { WorkerJob } from "./jobs";

/**
 * The slice of the pg-boss API the runtime uses. `pg-boss` v10's real client
 * satisfies this; `index.ts` adapts it, and tests pass a fake.
 */
export interface BossScheduler {
  /** Create the queue (idempotent in pg-boss v10). */
  createQueue(name: string): Promise<unknown>;
  /** Register a scheduled trigger for a queue (cron is UTC via `options.tz`). */
  schedule(name: string, cron: string, data?: unknown, options?: unknown): Promise<unknown>;
  /** Register the handler that drains a queue. */
  work(name: string, handler: (job: unknown) => Promise<unknown>): Promise<unknown>;
}

export interface RegisterOptions {
  /** Schedule timezone. Defaults to UTC. */
  tz?: string;
  /** Logger (defaults to console.log). */
  log?: (message: string, meta?: unknown) => void;
}

/**
 * Create the queue, register the work handler, and arm the cron schedule for
 * each job. The handler runs the pass, logs a structured summary, and returns
 * it (pg-boss stores completed-job output). Idempotent: re-registering an
 * existing queue/schedule is a no-op on pg-boss's side.
 */
export async function registerJobs(
  boss: BossScheduler,
  jobs: readonly WorkerJob[],
  options: RegisterOptions = {},
): Promise<void> {
  const log = options.log ?? ((m: string, meta?: unknown) => console.log(m, meta ?? ""));
  const tz = options.tz ?? "UTC";
  for (const job of jobs) {
    await boss.createQueue(job.name);
    await boss.work(job.name, async () => {
      const started = Date.now();
      log(`[worker] ${job.name} start`);
      try {
        const summary = await job.run();
        log(`[worker] ${job.name} ok in ${Date.now() - started}ms`, summary);
        return summary;
      } catch (err) {
        log(`[worker] ${job.name} FAILED in ${Date.now() - started}ms`, String(err));
        throw err;
      }
    });
    await boss.schedule(job.name, job.cron, {}, { tz });
    log(`[worker] scheduled ${job.name} (${job.cron} ${tz})`);
  }
}
