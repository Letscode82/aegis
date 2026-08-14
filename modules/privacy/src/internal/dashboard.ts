/**
 * DSAR operations dashboard (the "Privacy insights and oversight" surface).
 * Pure read-aggregation over DataSubjectRequest: volume by type / status /
 * handler, the open-queue health (overdue / due-soon / on-track), and a
 * six-month intake trend. The aggregation is a pure function so it's unit
 * tested; the exported service just fetches and calls it.
 */
import { prisma } from "@aegis/db";
import type { DSARStatus, DSARRequestType } from "@aegis/db";
import { slaState } from "./sla";
import { TERMINAL_STATUSES } from "./state-machine";

export interface DashboardRow {
  id: string;
  requestType: DSARRequestType;
  status: DSARStatus;
  assignedToUserId: string | null;
  submittedAt: Date;
  slaDeadline: Date;
  extendedDeadline: Date | null;
}

export interface DsarDashboard {
  totals: { all: number; open: number; overdue: number; dueSoon: number; fulfilled: number };
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byHandler: Array<{ userId: string | null; name: string; open: number }>;
  queueHealth: { breached: number; dueToday: number; dueSoon: number; onTrack: number };
  volumeByMonth: Array<{ month: string; count: number }>;
  generatedAt: string;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Pure aggregation. `handlerNames` maps userId → display name. */
export function aggregateDashboard(rows: DashboardRow[], handlerNames: Map<string, string>, now: Date): DsarDashboard {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const handlerOpen = new Map<string | null, number>();
  const queueHealth = { breached: 0, dueToday: 0, dueSoon: 0, onTrack: 0 };
  const volume = new Map<string, number>();

  let open = 0, overdue = 0, dueSoon = 0, fulfilled = 0;

  // Pre-seed the last 6 months so the trend has a continuous axis.
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    volume.set(monthKey(d), 0);
  }

  for (const r of rows) {
    byType[r.requestType] = (byType[r.requestType] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.status === "FULFILLED") fulfilled += 1;

    const mk = monthKey(r.submittedAt);
    if (volume.has(mk)) volume.set(mk, (volume.get(mk) ?? 0) + 1);

    const isOpen = !TERMINAL_STATUSES.has(r.status);
    if (isOpen) {
      open += 1;
      handlerOpen.set(r.assignedToUserId, (handlerOpen.get(r.assignedToUserId) ?? 0) + 1);
      const sla = slaState({ slaDeadline: r.slaDeadline, extendedDeadline: r.extendedDeadline }, now);
      if (sla.urgency === "BREACHED") { queueHealth.breached += 1; overdue += 1; }
      else if (sla.urgency === "DUE_TODAY") queueHealth.dueToday += 1;
      else if (sla.urgency === "DUE_SOON") { queueHealth.dueSoon += 1; dueSoon += 1; }
      else queueHealth.onTrack += 1;
    }
  }

  const byHandler = [...handlerOpen.entries()]
    .map(([userId, openCount]) => ({ userId, name: userId ? handlerNames.get(userId) ?? "Unknown" : "Unassigned", open: openCount }))
    .sort((a, b) => b.open - a.open);

  const volumeByMonth = [...volume.entries()].map(([month, count]) => ({ month, count }));

  return {
    totals: { all: rows.length, open, overdue, dueSoon, fulfilled },
    byType,
    byStatus,
    byHandler,
    queueHealth,
    volumeByMonth,
    generatedAt: now.toISOString(),
  };
}

export async function getDsarDashboard(organizationId: string): Promise<DsarDashboard> {
  const rows = await prisma.dataSubjectRequest.findMany({
    where: { organizationId },
    select: { id: true, requestType: true, status: true, assignedToUserId: true, submittedAt: true, slaDeadline: true, extendedDeadline: true },
  });
  const handlerIds = [...new Set(rows.map((r) => r.assignedToUserId).filter((x): x is string => !!x))];
  const users = handlerIds.length ? await prisma.user.findMany({ where: { id: { in: handlerIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return aggregateDashboard(rows as DashboardRow[], names, new Date());
}
