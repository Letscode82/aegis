/**
 * Item 5 (tiering) — pure pool-selection algorithm.
 *
 * No DB, no React: given a set of pools (each with members carrying a
 * live open-ticket load) pick the member a ticket should route to. The
 * DB-backed `buildPoolResolver` in ./teams.ts loads the pools + computes
 * per-member load, then delegates the *decision* here so the semantics
 * are identical everywhere and unit-testable in isolation.
 *
 * Selection semantics:
 *   - Only `active` members are eligible.
 *   - A member is "at capacity" when capacity > 0 AND openCount >=
 *     capacity. capacity === 0 means unbounded (never at capacity).
 *   - "least_loaded": pick the eligible-and-under-capacity member with
 *     the fewest open tickets. Tie-break by oldest lastAssignedAt
 *     (nulls first — never-picked before ties-broken first), then userId
 *     for total determinism.
 *   - "round_robin": among eligible-and-under-capacity members, pick the
 *     one whose lastAssignedAt is oldest (nulls first), then userId.
 *   - If no member is under capacity, follow the pool's overflowTeamId
 *     to the next pool and repeat. A visited-set guards against
 *     misconfigured overflow cycles.
 *   - If the chain is exhausted with no eligible member, return a pick
 *     with userId === null (the ticket stays unassigned for manual
 *     pickup — never silently dropped).
 */

export const POOL_STRATEGIES = ["least_loaded", "round_robin"] as const;
export type PoolStrategy = (typeof POOL_STRATEGIES)[number];

export interface PoolMemberLoad {
  userId: string;
  userName?: string | null;
  /** Max concurrent open tickets before "at capacity". 0 = unbounded. */
  capacity: number;
  /** Live count of the member's open tickets. */
  openCount: number;
  active: boolean;
  /** ISO string; null = never picked (round-robin favours these first). */
  lastAssignedAt?: string | null;
}

export interface PoolLike {
  id: string;
  key?: string;
  name?: string | null;
  strategy: string;
  members: PoolMemberLoad[];
  overflowTeamId?: string | null;
}

export interface PoolPick {
  /** The pool whose member was ultimately selected (post-overflow). */
  teamId: string;
  teamName?: string | null;
  /** The chosen member, or null when the whole chain is at capacity. */
  userId: string | null;
  userName?: string | null;
  /** Pool ids traversed before landing here (overflow breadcrumb). */
  overflowPath: string[];
  reason: string;
}

function isUnderCapacity(m: PoolMemberLoad): boolean {
  if (!m.active) return false;
  if (m.capacity <= 0) return true; // unbounded
  return m.openCount < m.capacity;
}

/** Ascending comparator: oldest lastAssignedAt first (null = oldest). */
function byLastAssignedThenId(a: PoolMemberLoad, b: PoolMemberLoad): number {
  const at = a.lastAssignedAt ? Date.parse(a.lastAssignedAt) : -Infinity;
  const bt = b.lastAssignedAt ? Date.parse(b.lastAssignedAt) : -Infinity;
  if (at !== bt) return at - bt;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

function pickWithinPool(pool: PoolLike): PoolMemberLoad | null {
  const eligible = pool.members.filter(isUnderCapacity);
  if (eligible.length === 0) return null;
  const strategy: PoolStrategy =
    pool.strategy === "round_robin" ? "round_robin" : "least_loaded";
  if (strategy === "round_robin") {
    return [...eligible].sort(byLastAssignedThenId)[0] ?? null;
  }
  // least_loaded: fewest open tickets, then round-robin tie-break.
  return [...eligible].sort((a, b) => {
    if (a.openCount !== b.openCount) return a.openCount - b.openCount;
    return byLastAssignedThenId(a, b);
  })[0] ?? null;
}

/**
 * Resolve a ticket's assignee for a route-to-pool action.
 * `poolsById` must contain every pool reachable via overflow.
 */
export function selectFromPool(
  teamId: string,
  poolsById: Map<string, PoolLike>,
): PoolPick {
  const overflowPath: string[] = [];
  const visited = new Set<string>();
  let current = poolsById.get(teamId);
  const rootName = current?.name ?? null;

  while (current) {
    if (visited.has(current.id)) {
      // Overflow cycle — stop and leave unassigned rather than loop.
      return {
        teamId: current.id,
        teamName: current.name ?? null,
        userId: null,
        userName: null,
        overflowPath,
        reason: "overflow-cycle-detected",
      };
    }
    visited.add(current.id);

    const member = pickWithinPool(current);
    if (member) {
      return {
        teamId: current.id,
        teamName: current.name ?? null,
        userId: member.userId,
        userName: member.userName ?? null,
        overflowPath,
        reason:
          overflowPath.length > 0
            ? `overflowed-from:${overflowPath.join(">")}`
            : current.strategy === "round_robin"
              ? "round_robin"
              : "least_loaded",
      };
    }

    // Everyone here is at capacity — try the overflow pool.
    overflowPath.push(current.id);
    const next = current.overflowTeamId
      ? poolsById.get(current.overflowTeamId)
      : undefined;
    if (!next) {
      return {
        teamId: current.id,
        teamName: current.name ?? null,
        userId: null,
        userName: null,
        overflowPath: overflowPath.slice(0, -1),
        reason: "all-at-capacity-no-overflow",
      };
    }
    current = next;
  }

  // Unknown team id — nothing to route to.
  return {
    teamId,
    teamName: rootName,
    userId: null,
    userName: null,
    overflowPath,
    reason: "unknown-team",
  };
}
