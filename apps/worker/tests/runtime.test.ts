/**
 * Worker runtime + job-catalog tests. Pure — a fake scheduler stands in for
 * pg-boss, so no Postgres or library is needed.
 */
import { describe, expect, it, vi } from "vitest";
import { registerJobs, type BossScheduler } from "../src/runtime";
import { WORKER_JOBS, type WorkerJob } from "../src/jobs";

interface Recorded {
  queues: string[];
  schedules: Array<{ name: string; cron: string; options: unknown }>;
  workers: Map<string, (job: unknown) => Promise<unknown>>;
}

function fakeBoss(): { boss: BossScheduler; rec: Recorded } {
  const rec: Recorded = { queues: [], schedules: [], workers: new Map() };
  const boss: BossScheduler = {
    createQueue: async (name) => {
      rec.queues.push(name);
    },
    schedule: async (name, cron, _data, options) => {
      rec.schedules.push({ name, cron, options });
    },
    work: async (name, handler) => {
      rec.workers.set(name, handler);
    },
  };
  return { boss, rec };
}

describe("WORKER_JOBS catalog", () => {
  it("has unique queue names", () => {
    const names = WORKER_JOBS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every job has a 5-field cron and a description", () => {
    for (const job of WORKER_JOBS) {
      expect(job.cron.trim().split(/\s+/)).toHaveLength(5);
      expect(job.description.length).toBeGreaterThan(0);
    }
  });

  it("covers the defensibility + SLA passes the worker is meant to host", () => {
    const names = WORKER_JOBS.map((j) => j.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "defensibility-snapshot",
        "defensibility-cleanup",
        "dsar-sla-sweep",
        "intake-sla-scan",
      ]),
    );
  });
});

describe("registerJobs", () => {
  it("creates a queue, work handler, and schedule for each job (UTC)", async () => {
    const { boss, rec } = fakeBoss();
    await registerJobs(boss, WORKER_JOBS, { log: () => {} });

    expect(rec.queues.sort()).toEqual(WORKER_JOBS.map((j) => j.name).sort());
    expect(rec.workers.size).toBe(WORKER_JOBS.length);
    for (const s of rec.schedules) {
      expect(s.options).toEqual({ tz: "UTC" });
    }
  });

  it("the registered handler runs the job's pass and returns its summary", async () => {
    const { boss, rec } = fakeBoss();
    const run = vi.fn(async () => ({ ok: true, ran: 3 }));
    const job: WorkerJob = { name: "t", cron: "0 0 * * *", description: "test", run };

    await registerJobs(boss, [job], { log: () => {} });
    const handler = rec.workers.get("t")!;
    const out = await handler([{ id: "job-1" }]);

    expect(run).toHaveBeenCalledOnce();
    expect(out).toEqual({ ok: true, ran: 3 });
  });

  it("a failing pass propagates so pg-boss records the job as failed", async () => {
    const { boss, rec } = fakeBoss();
    const job: WorkerJob = {
      name: "boom",
      cron: "0 0 * * *",
      description: "throws",
      run: async () => {
        throw new Error("kaboom");
      },
    };
    await registerJobs(boss, [job], { log: () => {} });
    await expect(rec.workers.get("boom")!({})).rejects.toThrow("kaboom");
  });
});
