/**
 * Scale processing queue (Track A / A1).
 *
 * The queue mechanics for the persistent Railway worker
 * (docs/scale-worker-runbook.md). Vercel enqueues; the worker claims,
 * checkpoints, and completes. Deliberately generic infrastructure — the
 * `kind` string is the dispatch key and `payloadJson` is opaque here; the
 * worker (matter module / scripts) owns the job taxonomy and interprets the
 * payload. Lives in @aegis/db because it is pure data access consumable by
 * both the app (enqueue / poll) and the worker (claim / complete); no module
 * logic leaks in.
 *
 * Claim safety: `claimNextProcessingJob` runs the select-and-mark in a
 * transaction using `FOR UPDATE SKIP LOCKED`, so N workers polling
 * concurrently each get a distinct job and never double-run one. A claim
 * whose worker died (stale heartbeat past the lease TTL) is reclaimable, so
 * a crash never strands a job. Raw SQL is allowed here — this IS
 * @aegis/db, the one package permitted to issue it.
 */
import { Prisma, type ProcessingJob, type ProcessingJobStatus } from "@prisma/client";
import { prisma } from "./client";

/** Default lease: a RUNNING job whose heartbeat is older than this is
 *  considered abandoned and may be reclaimed by another worker. */
export const DEFAULT_LEASE_MS = 5 * 60 * 1000;

/** Terminal states — a job in one of these is never claimed again. */
const TERMINAL: ReadonlySet<ProcessingJobStatus> = new Set<ProcessingJobStatus>([
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export function isTerminalJobStatus(status: ProcessingJobStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Exponential backoff for a retryable failure, capped. Pure — unit-tested.
 * attempt is the just-consumed attempt number (1-based).
 */
export function retryBackoffMs(attempt: number, baseMs = 10_000, capMs = 10 * 60 * 1000): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(capMs, baseMs * 2 ** (n - 1));
}

/**
 * Decide what happens after a failed attempt, given attempts consumed and
 * the ceiling. Pure — unit-tested so the requeue-vs-give-up rule is covered
 * without a live DB.
 */
export function decideAfterFailure(
  attempts: number,
  maxAttempts: number,
): { status: ProcessingJobStatus; retry: boolean; backoffMs: number } {
  if (attempts >= maxAttempts) return { status: "FAILED", retry: false, backoffMs: 0 };
  return { status: "QUEUED", retry: true, backoffMs: retryBackoffMs(attempts) };
}

export interface EnqueueProcessingJobInput {
  organizationId: string;
  kind: string;
  payload: Prisma.InputJsonValue;
  reviewSetId?: string | null;
  matterId?: string | null;
  priority?: number;
  maxAttempts?: number;
  /** Delay eligibility; omit to make it claimable immediately. */
  availableAt?: Date;
  enqueuedById?: string | null;
}

export async function enqueueProcessingJob(input: EnqueueProcessingJobInput): Promise<ProcessingJob> {
  return prisma.processingJob.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      payloadJson: input.payload,
      reviewSetId: input.reviewSetId ?? null,
      matterId: input.matterId ?? null,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? new Date(),
      enqueuedById: input.enqueuedById ?? null,
      status: "QUEUED",
    },
  });
}

export interface ClaimOptions {
  /** Restrict to a subset of kinds this worker knows how to run. */
  kinds?: string[];
  /** Only claim jobs for this org (default: any). */
  organizationId?: string;
  /** Lease TTL for reclaiming abandoned RUNNING jobs. */
  leaseMs?: number;
  now?: Date;
}

/**
 * Atomically claim the next eligible job for `workerId` and mark it RUNNING.
 * Eligible = QUEUED and availableAt ≤ now, OR RUNNING with a heartbeat older
 * than the lease (abandoned). Returns null when nothing is claimable.
 *
 * Ordering: priority DESC, then availableAt ASC (oldest first). The
 * transaction takes a row lock with SKIP LOCKED so concurrent workers fan
 * out across distinct jobs rather than contending on one.
 */
export async function claimNextProcessingJob(
  workerId: string,
  opts: ClaimOptions = {},
): Promise<ProcessingJob | null> {
  const now = opts.now ?? new Date();
  const leaseCutoff = new Date(now.getTime() - (opts.leaseMs ?? DEFAULT_LEASE_MS));
  const kinds = opts.kinds && opts.kinds.length > 0 ? opts.kinds : null;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ProcessingJob"
      WHERE (
              ("status" = 'QUEUED' AND "availableAt" <= ${now})
           OR ("status" = 'RUNNING' AND ("heartbeatAt" IS NULL OR "heartbeatAt" < ${leaseCutoff}))
            )
        AND "attempts" < "maxAttempts"
        ${opts.organizationId ? Prisma.sql`AND "organizationId" = ${opts.organizationId}` : Prisma.empty}
        ${kinds ? Prisma.sql`AND "kind" IN (${Prisma.join(kinds)})` : Prisma.empty}
      ORDER BY "priority" DESC, "availableAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    const id = rows[0]?.id;
    if (!id) return null;

    return tx.processingJob.update({
      where: { id },
      data: {
        status: "RUNNING",
        claimedBy: workerId,
        claimedAt: now,
        heartbeatAt: now,
        startedAt: now,
        attempts: { increment: 1 },
        error: null,
      },
    });
  });
}

/** Refresh the lease + optionally checkpoint progress while a job runs. */
export async function heartbeatProcessingJob(
  id: string,
  progress?: Prisma.InputJsonValue,
  now: Date = new Date(),
): Promise<void> {
  await prisma.processingJob.update({
    where: { id },
    data: { heartbeatAt: now, ...(progress !== undefined ? { progressJson: progress } : {}) },
  });
}

export async function completeProcessingJob(
  id: string,
  progress?: Prisma.InputJsonValue,
  now: Date = new Date(),
): Promise<ProcessingJob> {
  return prisma.processingJob.update({
    where: { id },
    data: {
      status: "SUCCEEDED",
      finishedAt: now,
      heartbeatAt: now,
      ...(progress !== undefined ? { progressJson: progress } : {}),
    },
  });
}

/**
 * Record a failed attempt. Requeues with backoff while attempts remain,
 * else marks FAILED. The job's current `attempts` is authoritative (the
 * claim already incremented it), so read-modify-write inside a transaction.
 */
export async function failProcessingJob(
  id: string,
  error: string,
  now: Date = new Date(),
): Promise<ProcessingJob> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.processingJob.findUniqueOrThrow({ where: { id } });
    const decision = decideAfterFailure(job.attempts, job.maxAttempts);
    return tx.processingJob.update({
      where: { id },
      data: {
        status: decision.status,
        error: error.slice(0, 2000),
        claimedBy: null,
        claimedAt: null,
        heartbeatAt: null,
        finishedAt: decision.retry ? null : now,
        availableAt: decision.retry ? new Date(now.getTime() + decision.backoffMs) : job.availableAt,
      },
    });
  });
}

export async function getProcessingJob(id: string): Promise<ProcessingJob | null> {
  return prisma.processingJob.findUnique({ where: { id } });
}

export interface JobQueueCounts {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

/** Queue-health snapshot for the org, for the admin UI poll. */
export async function getProcessingQueueCounts(organizationId: string): Promise<JobQueueCounts> {
  const grouped = await prisma.processingJob.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  const out: JobQueueCounts = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
  for (const g of grouped) {
    const key = g.status.toLowerCase() as keyof JobQueueCounts;
    out[key] = g._count._all;
  }
  return out;
}
