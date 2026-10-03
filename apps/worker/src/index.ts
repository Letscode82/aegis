/**
 * AEGIS async worker entrypoint (F-6).
 *
 * A long-running process that hosts the platform's scheduled jobs on
 * pg-boss, which stores its queues + schedules in the same Postgres the app
 * uses (its own `pgboss` schema, migrated on `start()`). Deploy it as a
 * separate always-on service (Railway, Fly, a container) with `DATABASE_URL`
 * set; see `docs/scheduler-worker.md`.
 *
 * This replaces the external-scheduler requirement for the existing jobs. The
 * HTTP trigger routes (`/api/cron/*`, `/api/admin/jobs/*`) stay in place as a
 * manual / fallback path, so nothing breaks if the worker isn't deployed.
 */
import PgBoss from "pg-boss";
import { WORKER_JOBS } from "./jobs";
import { registerJobs, type BossScheduler } from "./runtime";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run the AEGIS worker.");
  }

  const boss = new PgBoss({
    connectionString,
    schema: process.env.PGBOSS_SCHEMA || "pgboss",
  });
  boss.on("error", (err: Error) => console.error("[worker] pg-boss error:", err));

  await boss.start();

  // Adapt the concrete pg-boss client to the minimal interface the runtime
  // uses. Keeping the coupling here means runtime.ts stays library-agnostic
  // and unit-testable.
  const scheduler: BossScheduler = {
    createQueue: (name) => boss.createQueue(name),
    schedule: (name, cron, data, options) =>
      boss.schedule(name, cron, (data ?? {}) as object, (options ?? {}) as object),
    work: (name, handler) => boss.work(name, (jobs) => handler(jobs)),
  };

  await registerJobs(scheduler, WORKER_JOBS, { tz: "UTC" });
  console.log(`[worker] started — ${WORKER_JOBS.length} scheduled jobs registered.`);

  const stop = async (signal: string): Promise<void> => {
    console.log(`[worker] ${signal} received — stopping…`);
    try {
      await boss.stop({ graceful: true });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
