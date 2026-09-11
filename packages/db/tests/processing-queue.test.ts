/**
 * Scale processing queue tests (Track A / A1).
 *
 * The pure-helper suite (backoff / decide-after-failure / terminal) needs no
 * DB. The integration suite requires a live Postgres reachable via
 * DATABASE_URL with the A1 migration applied — CI's db-integrity job
 * satisfies that (applies all migrations from scratch); locally, run after
 * `docker compose up -d` + `pnpm --filter @aegis/db db:migrate:deploy`.
 *
 * Each integration test uses a per-test organisation id so the queue we
 * exercise is isolated from the seed's data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  claimNextProcessingJob,
  completeProcessingJob,
  decideAfterFailure,
  enqueueProcessingJob,
  failProcessingJob,
  getProcessingJob,
  getProcessingQueueCounts,
  heartbeatProcessingJob,
  isTerminalJobStatus,
  retryBackoffMs,
} from "../src";

describe("processing-queue pure helpers", () => {
  it("retryBackoffMs grows exponentially and caps", () => {
    expect(retryBackoffMs(1, 1000, 60_000)).toBe(1000);
    expect(retryBackoffMs(2, 1000, 60_000)).toBe(2000);
    expect(retryBackoffMs(3, 1000, 60_000)).toBe(4000);
    expect(retryBackoffMs(99, 1000, 60_000)).toBe(60_000); // capped
    expect(retryBackoffMs(0, 1000, 60_000)).toBe(1000); // floors attempt at 1
  });

  it("decideAfterFailure requeues while attempts remain, else fails", () => {
    expect(decideAfterFailure(1, 3)).toMatchObject({ status: "QUEUED", retry: true });
    expect(decideAfterFailure(2, 3)).toMatchObject({ status: "QUEUED", retry: true });
    const last = decideAfterFailure(3, 3);
    expect(last).toMatchObject({ status: "FAILED", retry: false, backoffMs: 0 });
  });

  it("isTerminalJobStatus classifies terminal vs live", () => {
    expect(isTerminalJobStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalJobStatus("FAILED")).toBe(true);
    expect(isTerminalJobStatus("CANCELLED")).toBe(true);
    expect(isTerminalJobStatus("QUEUED")).toBe(false);
    expect(isTerminalJobStatus("RUNNING")).toBe(false);
  });
});

describe("processing-queue integration (live DB)", () => {
  const prisma = new PrismaClient();
  let orgId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const org = await prisma.organization.create({
      data: { name: `pq-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("enqueue → claim → complete happy path", async () => {
    const job = await enqueueProcessingJob({ organizationId: orgId, kind: "TEST_INGEST", payload: { n: 1 } });
    expect(job.status).toBe("QUEUED");
    expect(job.attempts).toBe(0);

    const claimed = await claimNextProcessingJob("worker-a", { organizationId: orgId });
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("RUNNING");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.claimedBy).toBe("worker-a");

    await heartbeatProcessingJob(job.id, { processed: 5 });
    const done = await completeProcessingJob(job.id, { processed: 10 });
    expect(done.status).toBe("SUCCEEDED");
    expect(done.finishedAt).not.toBeNull();
    expect((done.progressJson as { processed: number }).processed).toBe(10);
  });

  it("does not claim the same job twice; second claim gets nothing", async () => {
    await enqueueProcessingJob({ organizationId: orgId, kind: "SOLO", payload: {} });
    const first = await claimNextProcessingJob("w1", { organizationId: orgId, kinds: ["SOLO"] });
    const second = await claimNextProcessingJob("w2", { organizationId: orgId, kinds: ["SOLO"] });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("failure requeues with backoff until maxAttempts, then FAILED", async () => {
    const job = await enqueueProcessingJob({
      organizationId: orgId,
      kind: "FLAKY",
      payload: {},
      maxAttempts: 2,
    });
    // attempt 1
    await claimNextProcessingJob("w", { organizationId: orgId, kinds: ["FLAKY"] });
    const afterFirst = await failProcessingJob(job.id, "boom-1");
    expect(afterFirst.status).toBe("QUEUED");
    expect(afterFirst.availableAt.getTime()).toBeGreaterThan(Date.now()); // backed off
    expect(afterFirst.claimedBy).toBeNull();

    // make it eligible again, attempt 2 (== maxAttempts) → FAILED
    await prisma.processingJob.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() - 1000) } });
    const claimed2 = await claimNextProcessingJob("w", { organizationId: orgId, kinds: ["FLAKY"] });
    expect(claimed2?.attempts).toBe(2);
    const afterSecond = await failProcessingJob(job.id, "boom-2");
    expect(afterSecond.status).toBe("FAILED");
    expect(afterSecond.error).toBe("boom-2");
    expect(afterSecond.finishedAt).not.toBeNull();

    // exhausted: not claimable
    await prisma.processingJob.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() - 1000) } });
    const claimed3 = await claimNextProcessingJob("w", { organizationId: orgId, kinds: ["FLAKY"] });
    expect(claimed3).toBeNull();
  });

  it("reclaims an abandoned RUNNING job past the lease", async () => {
    const job = await enqueueProcessingJob({ organizationId: orgId, kind: "LEASE", payload: {} });
    await claimNextProcessingJob("dead-worker", { organizationId: orgId, kinds: ["LEASE"] });
    // simulate a stale heartbeat well past the lease
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { heartbeatAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const reclaimed = await claimNextProcessingJob("live-worker", {
      organizationId: orgId,
      kinds: ["LEASE"],
      leaseMs: 5 * 60 * 1000,
    });
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.claimedBy).toBe("live-worker");
    expect(reclaimed?.attempts).toBe(2); // re-claim increments
    const fresh = await getProcessingJob(job.id);
    expect(fresh?.status).toBe("RUNNING");
  });

  it("queue counts reflect status distribution", async () => {
    const counts = await getProcessingQueueCounts(orgId);
    expect(counts.succeeded).toBeGreaterThanOrEqual(1);
    expect(counts.failed).toBeGreaterThanOrEqual(1);
    expect(typeof counts.running).toBe("number");
  });
});
