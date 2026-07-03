/**
 * W2-3 · Pool ops dashboard (issue #110) — server aggregation.
 *
 * Read-only: collects team rosters, live open-ticket load, routed-pick
 * audit rows, and close events, then delegates the math to the pure
 * ./compute module. No mutations, no audit writes — the chain is
 * unchanged by this surface.
 *
 * The "senior counsel freed for strategic work" evidence view: per-tier
 * utilization, overflow pressure, throughput, and complexity mix, all
 * from data the routing engine already produces.
 */
import { prisma } from "@aegis/db";
import { OPEN_TICKET_STATUSES } from "../routing/teams";
import { computePoolOps, parsePoolFiring } from "./compute";
import type {
  PoolFiringInput,
  PoolOpsSummaryDTO,
  PoolOpsTeamInput,
} from "./compute";

export type { PoolOpsSummaryDTO, PoolOpsTeamDTO } from "./compute";

/** Close events = the ticket left the working queue with a verdict. */
const CLOSE_ACTIONS = [
  "intake.ticket.closed",
  "intake.recommendation.manual_close",
];

/** Cap on audit rows scanned per query — demo-scale generous. */
const AUDIT_SCAN_LIMIT = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getPoolOpsSummary(
  organizationId: string,
  windowDays = 30,
): Promise<PoolOpsSummaryDTO> {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * DAY_MS);

  // 1 — team rosters with member names, one query.
  const teamRows = await prisma.intakeTeam.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      active: true,
      strategy: true,
      sortOrder: true,
      overflowTeam: { select: { name: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          userId: true,
          capacity: true,
          active: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  const teams: PoolOpsTeamInput[] = teamRows.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    active: t.active,
    strategy: t.strategy,
    sortOrder: t.sortOrder,
    overflowTeamName: t.overflowTeam?.name ?? null,
    members: t.members.map((m) => ({
      userId: m.userId,
      userName: m.user?.name ?? null,
      capacity: m.capacity,
      active: m.active,
    })),
  }));

  // 2 — every open ticket in the org (assignee + complexity + SLA).
  // Unassigned rows feed the manual-pickup queue depth.
  const openRows = await prisma.intakeTicket.findMany({
    where: { organizationId, status: { in: OPEN_TICKET_STATUSES } },
    select: { assignedToUserId: true, aiTriageJson: true, slaStatus: true },
  });
  const openTickets = openRows.map((r) => ({
    assignedToUserId: r.assignedToUserId,
    complexity:
      ((r.aiTriageJson as { complexity?: string } | null)?.complexity ?? null),
    slaStatus: r.slaStatus,
  }));

  // 3 — routed picks inside the window, parsed from the fired-rule
  // audit rows the chokepoint already writes.
  const firedRows = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: "intake.routing_rule.fired",
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "desc" },
    take: AUDIT_SCAN_LIMIT,
    select: { afterJson: true },
  });
  const firings = firedRows
    .map((r) => parsePoolFiring(r.afterJson))
    .filter((f): f is PoolFiringInput => f !== null);

  // 4 — close events inside the window, attributed to the ticket's
  // assignee at read time (who actually carried it over the line).
  const closedRows = await prisma.auditLog.findMany({
    where: {
      organizationId,
      action: { in: CLOSE_ACTIONS },
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "desc" },
    take: AUDIT_SCAN_LIMIT,
    select: { resourceId: true, timestamp: true },
  });
  // One close per ticket (a re-close audit row shouldn't double-count).
  const closedAtByTicket = new Map<string, Date>();
  for (const r of closedRows) {
    if (r.resourceId && !closedAtByTicket.has(r.resourceId)) {
      closedAtByTicket.set(r.resourceId, r.timestamp);
    }
  }
  const closedTicketIds = Array.from(closedAtByTicket.keys());
  const closedTickets = closedTicketIds.length
    ? await prisma.intakeTicket.findMany({
        where: { id: { in: closedTicketIds }, organizationId },
        select: { id: true, assignedToUserId: true },
      })
    : [];
  const closed = closedTickets.map((t) => {
    const at = closedAtByTicket.get(t.id) ?? now;
    return {
      assignedToUserId: t.assignedToUserId,
      daysAgo: Math.floor((now.getTime() - at.getTime()) / DAY_MS),
    };
  });

  return computePoolOps({ teams, openTickets, firings, closed, windowDays, now });
}
