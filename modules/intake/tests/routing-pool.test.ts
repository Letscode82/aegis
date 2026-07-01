/**
 * Item 5 (tiering) — pure pool-selection algorithm.
 *
 * Exercises least-loaded / round-robin selection, capacity gating,
 * overflow chaining, and cycle/dead-end safety without any DB.
 */
import { describe, expect, it } from "vitest";
import { selectFromPool } from "../src/routing/pool";
import type { PoolLike, PoolMemberLoad } from "../src/routing/pool";

function member(
  userId: string,
  over: Partial<PoolMemberLoad> = {},
): PoolMemberLoad {
  return {
    userId,
    userName: userId.toUpperCase(),
    capacity: 0,
    openCount: 0,
    active: true,
    lastAssignedAt: null,
    ...over,
  };
}

function pools(...list: PoolLike[]): Map<string, PoolLike> {
  return new Map(list.map((p) => [p.id, p]));
}

describe("selectFromPool — least_loaded", () => {
  it("picks the member with the fewest open tickets", () => {
    const p = pools({
      id: "t1",
      name: "Contracts",
      strategy: "least_loaded",
      members: [
        member("a", { openCount: 5 }),
        member("b", { openCount: 1 }),
        member("c", { openCount: 3 }),
      ],
    });
    const pick = selectFromPool("t1", p);
    expect(pick.userId).toBe("b");
    expect(pick.teamId).toBe("t1");
    expect(pick.reason).toBe("least_loaded");
    expect(pick.overflowPath).toEqual([]);
  });

  it("breaks ties by oldest lastAssignedAt, then userId", () => {
    const p = pools({
      id: "t1",
      name: "Contracts",
      strategy: "least_loaded",
      members: [
        member("z", { openCount: 2, lastAssignedAt: "2026-06-01T00:00:00Z" }),
        member("y", { openCount: 2, lastAssignedAt: null }), // never picked → oldest
        member("x", { openCount: 2, lastAssignedAt: "2026-06-02T00:00:00Z" }),
      ],
    });
    expect(selectFromPool("t1", p).userId).toBe("y");
  });

  it("excludes members at capacity (capacity>0 && openCount>=capacity)", () => {
    const p = pools({
      id: "t1",
      name: "Contracts",
      strategy: "least_loaded",
      members: [
        member("a", { openCount: 3, capacity: 3 }), // at capacity
        member("b", { openCount: 4, capacity: 0 }), // unbounded, eligible
      ],
    });
    expect(selectFromPool("t1", p).userId).toBe("b");
  });

  it("excludes inactive members", () => {
    const p = pools({
      id: "t1",
      name: "Contracts",
      strategy: "least_loaded",
      members: [
        member("a", { openCount: 0, active: false }),
        member("b", { openCount: 9 }),
      ],
    });
    expect(selectFromPool("t1", p).userId).toBe("b");
  });
});

describe("selectFromPool — round_robin", () => {
  it("picks the member idle the longest (oldest lastAssignedAt, nulls first)", () => {
    const p = pools({
      id: "t1",
      name: "Litigation",
      strategy: "round_robin",
      members: [
        member("a", { openCount: 0, lastAssignedAt: "2026-06-10T00:00:00Z" }),
        member("b", { openCount: 8, lastAssignedAt: "2026-06-01T00:00:00Z" }),
        member("c", { openCount: 2, lastAssignedAt: "2026-06-20T00:00:00Z" }),
      ],
    });
    // round-robin ignores openCount — b was assigned longest ago.
    expect(selectFromPool("t1", p).userId).toBe("b");
  });
});

describe("selectFromPool — overflow", () => {
  it("overflows to the next pool when everyone is at capacity", () => {
    const p = pools(
      {
        id: "senior",
        name: "Senior",
        strategy: "least_loaded",
        overflowTeamId: "junior",
        members: [member("s1", { openCount: 2, capacity: 2 })],
      },
      {
        id: "junior",
        name: "Junior",
        strategy: "least_loaded",
        members: [member("j1", { openCount: 0 })],
      },
    );
    const pick = selectFromPool("senior", p);
    expect(pick.userId).toBe("j1");
    expect(pick.teamId).toBe("junior");
    expect(pick.overflowPath).toEqual(["senior"]);
    expect(pick.reason).toBe("overflowed-from:senior");
  });

  it("returns unassigned when at capacity with no overflow target", () => {
    const p = pools({
      id: "t1",
      name: "Solo",
      strategy: "least_loaded",
      overflowTeamId: null,
      members: [member("a", { openCount: 1, capacity: 1 })],
    });
    const pick = selectFromPool("t1", p);
    expect(pick.userId).toBeNull();
    expect(pick.reason).toBe("all-at-capacity-no-overflow");
  });

  it("breaks overflow cycles rather than looping forever", () => {
    const p = pools(
      {
        id: "a",
        name: "A",
        strategy: "least_loaded",
        overflowTeamId: "b",
        members: [member("a1", { openCount: 1, capacity: 1 })],
      },
      {
        id: "b",
        name: "B",
        strategy: "least_loaded",
        overflowTeamId: "a", // cycle back
        members: [member("b1", { openCount: 1, capacity: 1 })],
      },
    );
    const pick = selectFromPool("a", p);
    expect(pick.userId).toBeNull();
    expect(pick.reason).toBe("overflow-cycle-detected");
  });

  it("returns unknown-team for an id not in the map", () => {
    const pick = selectFromPool("nope", pools());
    expect(pick.userId).toBeNull();
    expect(pick.reason).toBe("unknown-team");
  });
});
