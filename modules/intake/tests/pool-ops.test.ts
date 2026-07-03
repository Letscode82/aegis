/**
 * W2-3 (pool ops dashboard, issue #110) — pure aggregation semantics.
 */
import { describe, expect, it } from "vitest";
import { computePoolOps, parsePoolFiring } from "../src/pool-ops/compute";

const NOW = new Date("2026-07-03T12:00:00.000Z");

const TIER1 = {
  id: "team-1",
  key: "tier-1",
  name: "Tier 1 · Paralegals",
  active: true,
  strategy: "least_loaded",
  overflowTeamName: "Tier 2 · Counsel",
  sortOrder: 10,
  members: [
    { userId: "u-ana", userName: "Ana", capacity: 4, active: true },
    { userId: "u-ben", userName: "Ben", capacity: 2, active: true },
    { userId: "u-cal", userName: "Cal", capacity: 0, active: false },
  ],
};
const TIER2 = {
  id: "team-2",
  key: "tier-2",
  name: "Tier 2 · Counsel",
  active: true,
  strategy: "round_robin",
  overflowTeamName: null,
  sortOrder: 20,
  members: [{ userId: "u-dee", userName: "Dee", capacity: 0, active: true }],
};

describe("parsePoolFiring", () => {
  it("parses a pool pick action", () => {
    expect(
      parsePoolFiring({ actions: ["SLA → 8h", "pool Tier 1 · Paralegals → Ana"] }),
    ).toEqual({ teamName: "Tier 1 · Paralegals", overflow: false });
  });

  it("flags overflow picks", () => {
    expect(
      parsePoolFiring({ actions: ["pool Tier 2 · Counsel → Dee (overflow)"] }),
    ).toEqual({ teamName: "Tier 2 · Counsel", overflow: true });
  });

  it("returns null for non-pool rows and malformed json", () => {
    expect(parsePoolFiring({ actions: ["priority → Critical"] })).toBeNull();
    expect(parsePoolFiring({ actions: "not-an-array" })).toBeNull();
    expect(parsePoolFiring(null)).toBeNull();
    expect(parsePoolFiring({})).toBeNull();
  });
});

describe("computePoolOps", () => {
  const summary = computePoolOps({
    teams: [TIER2, TIER1], // out of order — sortOrder must win
    openTickets: [
      { assignedToUserId: "u-ana", complexity: "simple", slaStatus: "On Track" },
      { assignedToUserId: "u-ana", complexity: null, slaStatus: "At Risk" },
      { assignedToUserId: "u-ben", complexity: "complex", slaStatus: "Overdue" },
      { assignedToUserId: "u-dee", complexity: "complex", slaStatus: "On Track" },
      { assignedToUserId: null, complexity: null, slaStatus: "On Track" },
      { assignedToUserId: "u-nonmember", complexity: null, slaStatus: "On Track" },
    ],
    firings: [
      { teamName: "Tier 1 · Paralegals", overflow: false },
      { teamName: "Tier 1 · Paralegals", overflow: false },
      { teamName: "Tier 2 · Counsel", overflow: true },
    ],
    closed: [
      { assignedToUserId: "u-ana", daysAgo: 2 },
      { assignedToUserId: "u-ana", daysAgo: 20 },
      { assignedToUserId: "u-dee", daysAgo: 6 },
      { assignedToUserId: null, daysAgo: 1 },
    ],
    efforts: [
      { userId: "u-ana", minutes: 45 },
      { userId: "u-ana", minutes: 30 },
      { userId: "u-dee", minutes: 60 },
      { userId: null, minutes: 999 }, // unattributed → dropped
      { userId: "u-nonmember", minutes: 15 }, // not in any pool
    ],
    windowDays: 30,
    now: NOW,
  });

  const [t1, t2] = summary.teams;

  it("orders teams by sortOrder regardless of input order", () => {
    expect(summary.teams.map((t) => t.key)).toEqual(["tier-1", "tier-2"]);
  });

  it("computes member load and utilization (null for unbounded)", () => {
    const ana = t1?.members.find((m) => m.userId === "u-ana");
    const ben = t1?.members.find((m) => m.userId === "u-ben");
    const cal = t1?.members.find((m) => m.userId === "u-cal");
    expect(ana).toMatchObject({ openCount: 2, utilizationPct: 50 });
    expect(ben).toMatchObject({ openCount: 1, utilizationPct: 50 });
    expect(cal).toMatchObject({ openCount: 0, utilizationPct: null });
  });

  it("computes pool totals over finite capacities only", () => {
    expect(t1).toMatchObject({ openTotal: 3, capacityTotal: 6, utilizationPct: 50 });
    // Tier 2 is all-unbounded: utilization is honest-null, not fake-0%.
    expect(t2).toMatchObject({ openTotal: 1, capacityTotal: 0, utilizationPct: null });
  });

  it("buckets complexity with standard as the fallback band", () => {
    expect(t1?.complexityMix).toEqual({ simple: 1, standard: 1, complex: 1 });
    expect(t2?.complexityMix).toEqual({ simple: 0, standard: 0, complex: 1 });
  });

  it("counts SLA posture per tier", () => {
    expect(t1?.overdueCount).toBe(1);
    expect(t1?.atRiskCount).toBe(1);
    expect(t2?.overdueCount).toBe(0);
  });

  it("attributes routed + overflow picks by landing team", () => {
    expect(t1).toMatchObject({ routedCount: 2, overflowInCount: 0 });
    expect(t2).toMatchObject({ routedCount: 1, overflowInCount: 1 });
  });

  it("splits throughput into 7d and window totals", () => {
    expect(t1).toMatchObject({ closed7d: 1, closed30d: 2 });
    expect(t2).toMatchObject({ closed7d: 1, closed30d: 1 });
  });

  it("rolls logged effort minutes up per tier (W3-5)", () => {
    expect(t1?.effortMinutes).toBe(75);
    expect(t2?.effortMinutes).toBe(60);
  });

  it("reports the unassigned queue depth (non-members excluded)", () => {
    expect(summary.unassignedOpen).toBe(1);
    expect(summary.windowDays).toBe(30);
    expect(summary.generatedAt).toBe(NOW.toISOString());
  });
});
