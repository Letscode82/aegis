/**
 * Matter reporting + dashboard.
 *
 * Three surfaces:
 *
 *   1. getMatterDashboardStats — KPIs the /matter route renders:
 *      counts by status + type, age buckets, exposure-at-risk sum,
 *      spent-to-date sum (via the Spend stub).
 *
 *   2. getMattersByAttorneyReport — per-lead-attorney rollup with
 *      configurable period filter. Used by the GC to rebalance work.
 *
 *   3. getWorkloadReport — capacity bands per attorney based on
 *      active matter count. Heuristic for demo: <3 under, 3-7 normal,
 *      8+ over.
 *
 * All reports respect organization scope. Cross-org rollups are not
 * supported by design — that's a Command Center / Insights concern.
 */
import { prisma, type MatterStatus, type MatterType } from "@aegis/db";
import type {
  AttorneyWorkloadReport,
  AttorneyWorkloadRow,
  DashboardStats,
  ReportPeriod,
  WorkloadReport,
} from "../types";

const ALL_STATUSES: MatterStatus[] = [
  "DRAFT",
  "OPEN",
  "ACTIVE",
  "STAYED",
  "CLOSED",
  "ARCHIVED",
];

const ALL_TYPES: MatterType[] = [
  "LITIGATION",
  "TRANSACTIONAL",
  "MA",
  "IP",
  "EMPLOYMENT",
  "REGULATORY",
  "INVESTIGATION",
  "ADVISORY",
  "OTHER",
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Dashboard ──────────────────────────────────────────────────────

export async function getMatterDashboardStatsService(
  organizationId: string,
): Promise<DashboardStats> {
  const matters = await prisma.matter.findMany({
    where: { organizationId },
    select: {
      id: true,
      type: true,
      status: true,
      openedAt: true,
      closedAt: true,
      estimatedValue: true,
    },
  });

  const counts = {
    DRAFT: 0,
    OPEN: 0,
    ACTIVE: 0,
    STAYED: 0,
    CLOSED: 0,
    ARCHIVED: 0,
  } as Record<MatterStatus, number>;
  const typeCounts: Record<MatterType, number> = ALL_TYPES.reduce(
    (acc, t) => ({ ...acc, [t]: 0 }),
    {} as Record<MatterType, number>,
  );
  let exposureSum = 0;

  // Age buckets — only meaningful for non-terminal statuses.
  const buckets: Record<string, number> = {
    "0-30d": 0,
    "31-90d": 0,
    "91-180d": 0,
    "181-365d": 0,
    "365d+": 0,
  };

  const now = Date.now();
  for (const m of matters) {
    counts[m.status as MatterStatus] += 1;
    typeCounts[m.type as MatterType] += 1;
    if (m.estimatedValue) {
      exposureSum += Number(m.estimatedValue.toString());
    }
    if (m.status !== "CLOSED" && m.status !== "ARCHIVED") {
      const ageDays = Math.floor((now - m.openedAt.getTime()) / DAY_MS);
      const label =
        ageDays <= 30
          ? "0-30d"
          : ageDays <= 90
            ? "31-90d"
            : ageDays <= 180
              ? "91-180d"
              : ageDays <= 365
                ? "181-365d"
                : "365d+";
      buckets[label] = (buckets[label] ?? 0) + 1;
    }
  }

  // Spend-to-date — sum of approved + paid invoices org-wide. The
  // Spend module proper will replace this in Step 6.
  const spentAgg = await prisma.invoice.aggregate({
    where: {
      status: { in: ["APPROVED", "PAID"] },
      matter: { organizationId },
    },
    _sum: { amount: true },
  });

  return {
    totalDraft: counts.DRAFT,
    totalOpen: counts.OPEN,
    totalActive: counts.ACTIVE,
    totalStayed: counts.STAYED,
    totalClosed: counts.CLOSED,
    totalArchived: counts.ARCHIVED,
    byStatus: ALL_STATUSES.map((status) => ({
      status,
      count: counts[status],
    })),
    byType: ALL_TYPES.map((type) => ({ type, count: typeCounts[type] })),
    ageBuckets: Object.entries(buckets).map(([label, count]) => ({
      label,
      count,
    })),
    exposureSum,
    spentToDateSum: spentAgg._sum.amount ?? 0,
  };
}

// ── By-attorney report ────────────────────────────────────────────

export async function getMattersByAttorneyReportService(
  organizationId: string,
  period: ReportPeriod,
): Promise<AttorneyWorkloadReport> {
  const matters = await prisma.matter.findMany({
    where: {
      organizationId,
      ...(period.fromDate && { openedAt: { gte: period.fromDate } }),
      ...(period.toDate && { openedAt: { lte: period.toDate } }),
    },
    select: {
      leadAttorneyId: true,
      status: true,
      estimatedValue: true,
    },
  });

  const personIds = Array.from(
    new Set(
      matters.map((m) => m.leadAttorneyId).filter((id): id is string => !!id),
    ),
  );
  const persons = personIds.length
    ? await prisma.person.findMany({
        where: { id: { in: personIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(persons.map((p) => [p.id, p.name]));

  const rows = new Map<string, AttorneyWorkloadRow>();
  for (const m of matters) {
    if (!m.leadAttorneyId) continue;
    const row =
      rows.get(m.leadAttorneyId) ??
      ({
        personId: m.leadAttorneyId,
        personName: nameById.get(m.leadAttorneyId) ?? "Unknown",
        draftCount: 0,
        openCount: 0,
        activeCount: 0,
        closedCount: 0,
        totalEstimatedValue: 0,
      } satisfies AttorneyWorkloadRow);
    if (m.status === "DRAFT") row.draftCount += 1;
    else if (m.status === "OPEN") row.openCount += 1;
    else if (m.status === "ACTIVE" || m.status === "STAYED") row.activeCount += 1;
    else if (m.status === "CLOSED" || m.status === "ARCHIVED") row.closedCount += 1;
    if (m.estimatedValue) {
      row.totalEstimatedValue += Number(m.estimatedValue.toString());
    }
    rows.set(m.leadAttorneyId, row);
  }

  return {
    generatedAt: new Date(),
    period,
    rows: Array.from(rows.values()).sort(
      (a, b) =>
        b.activeCount + b.openCount - (a.activeCount + a.openCount),
    ),
  };
}

// ── Workload report ───────────────────────────────────────────────

export async function getWorkloadReportService(
  organizationId: string,
): Promise<WorkloadReport> {
  const grouped = await prisma.matter.groupBy({
    by: ["leadAttorneyId"],
    where: {
      organizationId,
      status: { in: ["OPEN", "ACTIVE", "STAYED"] },
      leadAttorneyId: { not: null },
    },
    _count: { _all: true },
  });

  const personIds = grouped
    .map((g) => g.leadAttorneyId)
    .filter((id): id is string => !!id);
  const persons = personIds.length
    ? await prisma.person.findMany({
        where: { id: { in: personIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(persons.map((p) => [p.id, p.name]));

  return {
    generatedAt: new Date(),
    rows: grouped
      .filter((g) => g.leadAttorneyId)
      .map((g) => ({
        personId: g.leadAttorneyId as string,
        personName: nameById.get(g.leadAttorneyId as string) ?? "Unknown",
        activeCount: g._count._all,
        capacityBand:
          g._count._all < 3
            ? ("under" as const)
            : g._count._all <= 7
              ? ("normal" as const)
              : ("over" as const),
      }))
      .sort((a, b) => b.activeCount - a.activeCount),
  };
}
