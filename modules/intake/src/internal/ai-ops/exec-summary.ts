/**
 * Executive operations summary — C-14 (exec-analytics depth).
 *
 * Promotes the AI Operations panel set into a GC-level executive view.
 * Where `summary.ts` answers "how is the AI loop performing", this answers
 * "how is the legal-intake operation performing" across four executive
 * dimensions:
 *
 *   1. Queue health   — live posture: open volume, status mix, SLA mix,
 *                        priority mix.
 *   2. Throughput      — created vs. resolved over 7/30-day windows and the
 *                        resulting backlog delta (is the queue growing?).
 *   3. Attorney load   — open work per assignee, with at-risk / breached
 *                        counts so the GC sees who is underwater.
 *   4. Routing effect  — per-rule fire counts (the automation's reach).
 *
 * Pure read aggregation over existing tables (IntakeTicket, AuditLog,
 * IntakeRoutingRule, User). No mutations, no new audit rows — the chain is
 * unchanged by this module. Gated identically to `getAIOperationsSummary`
 * at the route (`intake:read_all_tickets` OR `audit:read_all`).
 *
 * Every panel is wrapped so one transient DB failure degrades that panel
 * rather than the whole executive view — same posture as summary.ts.
 */

import { prisma } from "@aegis/db";

// ── Shared vocabulary ────────────────────────────────────────────────

/** Status values that count as "still in the queue" (not resolved). */
const OPEN_STATUSES = ["AWAITING_TRIAGE", "IN_REVIEW", "ESCALATED"] as const;

const ALL_STATUSES = [
  "AWAITING_TRIAGE",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "ESCALATED",
  "CLOSED",
] as const;
type IntakeStatusName = (typeof ALL_STATUSES)[number];

const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
type PriorityName = (typeof PRIORITIES)[number];

/** Audit actions that resolve a ticket — used for throughput "resolved". */
const RESOLVING_ACTIONS = [
  "intake.recommendation.approved",
  "intake.recommendation.edited_approved",
  "intake.recommendation.rejected",
  "intake.recommendation.manual_close",
  "intake.ticket.closed",
] as const;

// ── Result types ─────────────────────────────────────────────────────

export interface QueueHealth {
  /** Every ticket the org has ever filed. */
  total: number;
  /** Tickets still in the queue (OPEN_STATUSES). */
  open: number;
  /** Count by every status value. */
  byStatus: Record<IntakeStatusName, number>;
  /** SLA posture over OPEN tickets only — a breached-but-closed ticket is
   *  history, not a live risk. Keys mirror IntakeTicket.slaStatus. */
  bySla: { onTrack: number; atRisk: number; breached: number };
  /** Priority mix over OPEN tickets only. */
  byPriority: Record<PriorityName, number>;
}

export interface Throughput {
  createdLast7: number;
  resolvedLast7: number;
  createdLast30: number;
  resolvedLast30: number;
  /** created − resolved over the last 7 days. Positive = queue growing. */
  backlogDelta7: number;
  /** created − resolved over the last 30 days. */
  backlogDelta30: number;
}

export interface AttorneyLoad {
  userId: string;
  name: string;
  /** Open tickets currently assigned to this user. */
  open: number;
  atRisk: number;
  breached: number;
}

export interface RoutingEffectiveness {
  id: string;
  name: string;
  enabled: boolean;
  timesFired: number;
  lastFiredAt: string | null;
}

export type ExecPanel =
  | "queueHealth"
  | "throughput"
  | "attorneyLoad"
  | "routingEffectiveness";

export interface ExecutiveOperationsSummary {
  queueHealth: QueueHealth;
  throughput: Throughput;
  /** Top assignees by open workload, busiest first. */
  attorneyLoad: AttorneyLoad[];
  /** Enabled routing rules by fire count, most-fired first. */
  routingEffectiveness: RoutingEffectiveness[];
  asOf: string;
  /** Panels whose upstream query failed; the rest are live. */
  panelErrors: ExecPanel[];
}

// ── Sentinels ────────────────────────────────────────────────────────

const EMPTY_QUEUE_HEALTH: QueueHealth = {
  total: 0,
  open: 0,
  byStatus: {
    AWAITING_TRIAGE: 0,
    IN_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    ESCALATED: 0,
    CLOSED: 0,
  },
  bySla: { onTrack: 0, atRisk: 0, breached: 0 },
  byPriority: { Critical: 0, High: 0, Medium: 0, Low: 0 },
};

const EMPTY_THROUGHPUT: Throughput = {
  createdLast7: 0,
  resolvedLast7: 0,
  createdLast30: 0,
  resolvedLast30: 0,
  backlogDelta7: 0,
  backlogDelta30: 0,
};

// ── Helpers ──────────────────────────────────────────────────────────

function daysAgo(now: Date, n: number): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

/** Normalise an arbitrary slaStatus string into one of three buckets. */
function slaBucket(s: string | null | undefined): "onTrack" | "atRisk" | "breached" {
  const v = (s || "").toLowerCase();
  if (v.includes("breach")) return "breached";
  if (v.includes("risk")) return "atRisk";
  return "onTrack";
}

// ── Panel 1: queue health ────────────────────────────────────────────

export async function getQueueHealth(organizationId: string): Promise<QueueHealth> {
  // Status mix for the whole org in one groupBy.
  const statusGroups = await prisma.intakeTicket.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  const byStatus: Record<IntakeStatusName, number> = {
    AWAITING_TRIAGE: 0,
    IN_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    ESCALATED: 0,
    CLOSED: 0,
  };
  let total = 0;
  for (const g of statusGroups) {
    const n = g._count._all;
    total += n;
    if ((ALL_STATUSES as readonly string[]).includes(g.status)) {
      byStatus[g.status as IntakeStatusName] = n;
    }
  }
  const open = OPEN_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  // SLA mix + priority mix over OPEN tickets only. Pull just the two
  // scalar columns so the row payload stays small even for large queues.
  const openTickets = await prisma.intakeTicket.findMany({
    where: { organizationId, status: { in: [...OPEN_STATUSES] } },
    select: { slaStatus: true, priority: true },
  });
  const bySla = { onTrack: 0, atRisk: 0, breached: 0 };
  const byPriority: Record<PriorityName, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  for (const t of openTickets) {
    bySla[slaBucket(t.slaStatus)] += 1;
    if ((PRIORITIES as readonly string[]).includes(t.priority)) {
      byPriority[t.priority as PriorityName] += 1;
    }
  }

  return { total, open, byStatus, bySla, byPriority };
}

// ── Panel 2: throughput ──────────────────────────────────────────────

export async function getThroughput(
  organizationId: string,
  now: Date = new Date(),
): Promise<Throughput> {
  const d7 = daysAgo(now, 7);
  const d30 = daysAgo(now, 30);

  // Created — distinct tickets created in each window (IntakeTicket.createdAt
  // is authoritative; audit "created" rows can lag or double on replay).
  const [createdLast7, createdLast30] = await Promise.all([
    prisma.intakeTicket.count({ where: { organizationId, createdAt: { gte: d7 } } }),
    prisma.intakeTicket.count({ where: { organizationId, createdAt: { gte: d30 } } }),
  ]);

  // Resolved — distinct tickets with a resolving audit action in each window.
  // Using the ledger (not IntakeTicket.updatedAt) so a later unrelated edit
  // doesn't recount a ticket as freshly resolved.
  async function resolvedSince(since: Date): Promise<number> {
    const rows = await prisma.auditLog.findMany({
      where: {
        organizationId,
        action: { in: [...RESOLVING_ACTIONS] },
        resourceType: "IntakeTicket",
        timestamp: { gte: since },
      },
      distinct: ["resourceId"],
      select: { resourceId: true },
    });
    return rows.length;
  }
  const [resolvedLast7, resolvedLast30] = await Promise.all([
    resolvedSince(d7),
    resolvedSince(d30),
  ]);

  return {
    createdLast7,
    resolvedLast7,
    createdLast30,
    resolvedLast30,
    backlogDelta7: createdLast7 - resolvedLast7,
    backlogDelta30: createdLast30 - resolvedLast30,
  };
}

// ── Panel 3: attorney load ───────────────────────────────────────────

export async function getAttorneyLoad(
  organizationId: string,
  limit = 8,
): Promise<AttorneyLoad[]> {
  // Open tickets with a typed assignee, grouped by assignee.
  const groups = await prisma.intakeTicket.groupBy({
    by: ["assignedToUserId"],
    where: {
      organizationId,
      status: { in: [...OPEN_STATUSES] },
      assignedToUserId: { not: null },
    },
    _count: { _all: true },
    orderBy: { _count: { assignedToUserId: "desc" } },
    take: limit,
  });
  const userIds = groups
    .map((g) => g.assignedToUserId)
    .filter((id): id is string => !!id);
  if (userIds.length === 0) return [];

  // Resolve names + SLA posture for just these assignees' open tickets.
  const [users, slaRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, organizationId },
      select: { id: true, name: true },
    }),
    prisma.intakeTicket.findMany({
      where: {
        organizationId,
        status: { in: [...OPEN_STATUSES] },
        assignedToUserId: { in: userIds },
      },
      select: { assignedToUserId: true, slaStatus: true },
    }),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const atRiskById = new Map<string, number>();
  const breachedById = new Map<string, number>();
  for (const row of slaRows) {
    const uid = row.assignedToUserId;
    if (!uid) continue;
    const bucket = slaBucket(row.slaStatus);
    if (bucket === "atRisk") atRiskById.set(uid, (atRiskById.get(uid) ?? 0) + 1);
    else if (bucket === "breached") breachedById.set(uid, (breachedById.get(uid) ?? 0) + 1);
  }

  return groups.map((g) => {
    const uid = g.assignedToUserId as string;
    return {
      userId: uid,
      name: nameById.get(uid) ?? "Unknown user",
      open: g._count._all,
      atRisk: atRiskById.get(uid) ?? 0,
      breached: breachedById.get(uid) ?? 0,
    };
  });
}

// ── Panel 4: routing effectiveness ───────────────────────────────────

export async function getRoutingEffectiveness(
  organizationId: string,
  limit = 8,
): Promise<RoutingEffectiveness[]> {
  const rules = await prisma.intakeRoutingRule.findMany({
    where: { organizationId },
    orderBy: [{ timesFired: "desc" }, { evalOrder: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      enabled: true,
      timesFired: true,
      lastFiredAt: true,
    },
  });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    timesFired: r.timesFired,
    lastFiredAt: r.lastFiredAt ? r.lastFiredAt.toISOString() : null,
  }));
}

// ── Composer ─────────────────────────────────────────────────────────

async function runPanel<T>(
  panel: ExecPanel,
  organizationId: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<{ value: T; ok: boolean }> {
  try {
    return { value: await load(), ok: true };
  } catch (err) {
    const e = err as { name?: string; message?: string; stack?: string };
    console.error(
      JSON.stringify({
        source: "@aegis/intake/ai-ops/exec-summary",
        panel,
        organizationId,
        errorName: e?.name ?? "Error",
        errorMessage: e?.message ?? String(err),
        stack: e?.stack ?? null,
      }),
    );
    return { value: fallback, ok: false };
  }
}

export async function getExecutiveOperationsSummary(
  organizationId: string,
  now: Date = new Date(),
): Promise<ExecutiveOperationsSummary> {
  const [queueHealth, throughput, attorneyLoad, routingEffectiveness] =
    await Promise.all([
      runPanel("queueHealth", organizationId, () => getQueueHealth(organizationId), EMPTY_QUEUE_HEALTH),
      runPanel("throughput", organizationId, () => getThroughput(organizationId, now), EMPTY_THROUGHPUT),
      runPanel("attorneyLoad", organizationId, () => getAttorneyLoad(organizationId, 8), [] as AttorneyLoad[]),
      runPanel("routingEffectiveness", organizationId, () => getRoutingEffectiveness(organizationId, 8), [] as RoutingEffectiveness[]),
    ]);

  const panelErrors: ExecPanel[] = [];
  if (!queueHealth.ok) panelErrors.push("queueHealth");
  if (!throughput.ok) panelErrors.push("throughput");
  if (!attorneyLoad.ok) panelErrors.push("attorneyLoad");
  if (!routingEffectiveness.ok) panelErrors.push("routingEffectiveness");

  return {
    queueHealth: queueHealth.value,
    throughput: throughput.value,
    attorneyLoad: attorneyLoad.value,
    routingEffectiveness: routingEffectiveness.value,
    asOf: now.toISOString(),
    panelErrors,
  };
}
