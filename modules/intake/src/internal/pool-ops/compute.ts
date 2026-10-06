/**
 * W2-3 · Pool ops dashboard (issue #110) — pure aggregation.
 *
 * No DB, no React: takes team rows + open-ticket rows + fired-rule
 * audit summaries + closed-ticket attributions and computes the
 * per-tier operations picture (utilization, complexity mix, overflow,
 * throughput). The server module (./server.ts) owns the queries; this
 * module owns the math so it's unit-testable and identical everywhere.
 *
 * Attribution model: a ticket belongs to a tier if its current
 * `assignedToUserId` is a member of that team. Simple, live, and
 * honest — it reflects who actually holds the work right now.
 */

type ComplexityKey = "simple" | "standard" | "complex";

export interface PoolOpsMemberInput {
  userId: string;
  userName: string | null;
  /** 0 = unbounded (never counts toward pool capacity). */
  capacity: number;
  active: boolean;
}

export interface PoolOpsTeamInput {
  id: string;
  key: string;
  name: string;
  active: boolean;
  strategy: string;
  overflowTeamName: string | null;
  sortOrder: number;
  members: PoolOpsMemberInput[];
}

export interface PoolOpsOpenTicketInput {
  assignedToUserId: string | null;
  /** aiTriageJson.complexity — "simple" | "standard" | "complex" | null. */
  complexity: string | null;
  slaStatus: string | null;
}

/** One routed-pick parsed out of an `intake.routing_rule.fired` audit row. */
export interface PoolFiringInput {
  teamName: string;
  overflow: boolean;
}

/** Assignee of a ticket that closed inside the window, with its age. */
export interface ClosedTicketInput {
  assignedToUserId: string | null;
  /** Days ago the close happened (0 = today). */
  daysAgo: number;
}

/** One effort log inside the window (W3-5), attributed to the logger. */
export interface EffortLogInput {
  userId: string | null;
  minutes: number;
}

export interface PoolOpsMemberDTO {
  userId: string;
  userName: string | null;
  capacity: number;
  active: boolean;
  openCount: number;
  /** openCount / capacity as 0–100+; null when capacity is unbounded. */
  utilizationPct: number | null;
}

export interface PoolOpsTeamDTO {
  id: string;
  key: string;
  name: string;
  active: boolean;
  strategy: string;
  overflowTeamName: string | null;
  members: PoolOpsMemberDTO[];
  openTotal: number;
  /** Sum of finite member capacities (0-capacity members excluded). */
  capacityTotal: number;
  /** openTotal / capacityTotal; null when no member has a finite cap. */
  utilizationPct: number | null;
  complexityMix: { simple: number; standard: number; complex: number };
  overdueCount: number;
  atRiskCount: number;
  /** Routed picks that landed on this team inside the window. */
  routedCount: number;
  /** Of those, how many arrived via an overflow hop. */
  overflowInCount: number;
  closed7d: number;
  closed30d: number;
  /** W3-5 — minutes logged by members inside the window. */
  effortMinutes: number;
}

export interface PoolOpsSummaryDTO {
  generatedAt: string;
  windowDays: number;
  teams: PoolOpsTeamDTO[];
  /** Open tickets assigned to nobody (manual-pickup queue depth). */
  unassignedOpen: number;
}

/**
 * Parse the routed-pool pick out of one `intake.routing_rule.fired`
 * audit row's `afterJson.actions` array. The chokepoint records pool
 * picks as `pool <teamName> → <who>` with an ` (overflow)` suffix when
 * the pick arrived via an overflow hop. Returns null for rows whose
 * actions carry no pool pick (priority/SLA/direct-assignee rules).
 */
export function parsePoolFiring(afterJson: unknown): PoolFiringInput | null {
  const actions = (afterJson as { actions?: unknown } | null)?.actions;
  if (!Array.isArray(actions)) return null;
  for (const a of actions) {
    if (typeof a !== "string" || !a.startsWith("pool ")) continue;
    const arrow = a.indexOf(" → ");
    if (arrow <= 5) continue;
    return {
      teamName: a.slice(5, arrow),
      overflow: a.endsWith("(overflow)"),
    };
  }
  return null;
}

function normalizeComplexity(v: string | null): ComplexityKey {
  return v === "simple" || v === "complex" ? v : "standard";
}

export function computePoolOps(input: {
  teams: PoolOpsTeamInput[];
  openTickets: PoolOpsOpenTicketInput[];
  firings: PoolFiringInput[];
  closed: ClosedTicketInput[];
  /** W3-5 — effort logs inside the window. Optional for callers that
   *  predate effort capture. */
  efforts?: EffortLogInput[];
  windowDays: number;
  now: Date;
}): PoolOpsSummaryDTO {
  const { teams, openTickets, firings, closed, windowDays, now } = input;
  const efforts = input.efforts ?? [];

  // Open tickets grouped once by assignee.
  const openByUser = new Map<string, PoolOpsOpenTicketInput[]>();
  let unassignedOpen = 0;
  for (const t of openTickets) {
    if (!t.assignedToUserId) {
      unassignedOpen += 1;
      continue;
    }
    const list = openByUser.get(t.assignedToUserId);
    if (list) list.push(t);
    else openByUser.set(t.assignedToUserId, [t]);
  }

  // Fired-pick counts by landing-team name.
  const routedByTeam = new Map<string, { routed: number; overflow: number }>();
  for (const f of firings) {
    const row = routedByTeam.get(f.teamName) ?? { routed: 0, overflow: 0 };
    row.routed += 1;
    if (f.overflow) row.overflow += 1;
    routedByTeam.set(f.teamName, row);
  }

  // Effort minutes by logger (W3-5).
  const effortByUser = new Map<string, number>();
  for (const e of efforts) {
    if (!e.userId || !(e.minutes > 0)) continue;
    effortByUser.set(e.userId, (effortByUser.get(e.userId) ?? 0) + e.minutes);
  }

  // Closed counts by assignee, split 7d / windowDays.
  const closed7ByUser = new Map<string, number>();
  const closedAllByUser = new Map<string, number>();
  for (const c of closed) {
    if (!c.assignedToUserId) continue;
    closedAllByUser.set(
      c.assignedToUserId,
      (closedAllByUser.get(c.assignedToUserId) ?? 0) + 1,
    );
    if (c.daysAgo <= 7) {
      closed7ByUser.set(
        c.assignedToUserId,
        (closed7ByUser.get(c.assignedToUserId) ?? 0) + 1,
      );
    }
  }

  const teamDTOs = [...teams]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((team): PoolOpsTeamDTO => {
      const mix = { simple: 0, standard: 0, complex: 0 };
      let overdue = 0;
      let atRisk = 0;
      let openTotal = 0;
      let capacityTotal = 0;
      let closed7 = 0;
      let closedAll = 0;
      let effortMinutes = 0;

      const members = team.members.map((m): PoolOpsMemberDTO => {
        const mine = openByUser.get(m.userId) ?? [];
        openTotal += mine.length;
        if (m.capacity > 0) capacityTotal += m.capacity;
        for (const t of mine) {
          mix[normalizeComplexity(t.complexity)] += 1;
          if (/overdue|breach/i.test(t.slaStatus ?? "")) overdue += 1;
          else if (/risk/i.test(t.slaStatus ?? "")) atRisk += 1;
        }
        closed7 += closed7ByUser.get(m.userId) ?? 0;
        closedAll += closedAllByUser.get(m.userId) ?? 0;
        effortMinutes += effortByUser.get(m.userId) ?? 0;
        return {
          userId: m.userId,
          userName: m.userName,
          capacity: m.capacity,
          active: m.active,
          openCount: mine.length,
          utilizationPct:
            m.capacity > 0 ? Math.round((mine.length / m.capacity) * 100) : null,
        };
      });

      const routed = routedByTeam.get(team.name) ?? { routed: 0, overflow: 0 };
      return {
        id: team.id,
        key: team.key,
        name: team.name,
        active: team.active,
        strategy: team.strategy,
        overflowTeamName: team.overflowTeamName,
        members,
        openTotal,
        capacityTotal,
        utilizationPct:
          capacityTotal > 0 ? Math.round((openTotal / capacityTotal) * 100) : null,
        complexityMix: mix,
        overdueCount: overdue,
        atRiskCount: atRisk,
        routedCount: routed.routed,
        overflowInCount: routed.overflow,
        closed7d: closed7,
        closed30d: closedAll,
        effortMinutes,
      };
    });

  return {
    generatedAt: now.toISOString(),
    windowDays,
    teams: teamDTOs,
    unassignedOpen,
  };
}
