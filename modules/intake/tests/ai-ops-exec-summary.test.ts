/**
 * Unit tests for the executive operations summary service (C-14).
 *
 * Prisma is mocked at the module boundary; the tests exercise each
 * panel's aggregation + result shape independently and via the
 * top-level composer, including per-panel degradation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const intakeTicketGroupBy = vi.fn();
const intakeTicketFindMany = vi.fn();
const intakeTicketCount = vi.fn();
const auditLogFindMany = vi.fn();
const userFindMany = vi.fn();
const intakeRoutingRuleFindMany = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicket: {
      groupBy: intakeTicketGroupBy,
      findMany: intakeTicketFindMany,
      count: intakeTicketCount,
    },
    auditLog: { findMany: auditLogFindMany },
    user: { findMany: userFindMany },
    intakeRoutingRule: { findMany: intakeRoutingRuleFindMany },
  },
}));

const {
  getQueueHealth,
  getThroughput,
  getAttorneyLoad,
  getRoutingEffectiveness,
  getExecutiveOperationsSummary,
} = await import("../src/ai-ops/exec-summary");

beforeEach(() => {
  intakeTicketGroupBy.mockReset();
  intakeTicketFindMany.mockReset();
  intakeTicketCount.mockReset();
  auditLogFindMany.mockReset();
  userFindMany.mockReset();
  intakeRoutingRuleFindMany.mockReset();
});

// ── Panel 1: queue health ────────────────────────────────────────────

describe("getQueueHealth()", () => {
  it("sums status mix, counts open, and buckets SLA + priority over open tickets", async () => {
    intakeTicketGroupBy.mockResolvedValueOnce([
      { status: "AWAITING_TRIAGE", _count: { _all: 4 } },
      { status: "IN_REVIEW", _count: { _all: 2 } },
      { status: "ESCALATED", _count: { _all: 1 } },
      { status: "CLOSED", _count: { _all: 10 } },
    ]);
    intakeTicketFindMany.mockResolvedValueOnce([
      { slaStatus: "On Track", priority: "High" },
      { slaStatus: "At Risk", priority: "Critical" },
      { slaStatus: "Breached", priority: "Critical" },
      { slaStatus: "On Track", priority: "Low" },
      { slaStatus: null, priority: "Medium" },
      { slaStatus: "At Risk", priority: "High" },
      { slaStatus: "On Track", priority: "High" },
    ]);

    const out = await getQueueHealth("org1");
    expect(out.total).toBe(17);
    expect(out.open).toBe(7); // 4 + 2 + 1
    expect(out.byStatus.CLOSED).toBe(10);
    expect(out.bySla).toEqual({ onTrack: 4, atRisk: 2, breached: 1 }); // 3 "On Track" + null → onTrack
    expect(out.byPriority).toEqual({ Critical: 2, High: 3, Medium: 1, Low: 1 });
  });
});

// ── Panel 2: throughput ──────────────────────────────────────────────

describe("getThroughput()", () => {
  it("computes created/resolved per window and backlog deltas", async () => {
    // createdLast7, createdLast30
    intakeTicketCount.mockResolvedValueOnce(5).mockResolvedValueOnce(20);
    // resolvedSince(d7), resolvedSince(d30) — distinct resourceId rows
    auditLogFindMany
      .mockResolvedValueOnce([{ resourceId: "t1" }, { resourceId: "t2" }])
      .mockResolvedValueOnce([
        { resourceId: "t1" },
        { resourceId: "t2" },
        { resourceId: "t3" },
      ]);

    const out = await getThroughput("org1", new Date("2026-10-05T00:00:00Z"));
    expect(out.createdLast7).toBe(5);
    expect(out.resolvedLast7).toBe(2);
    expect(out.createdLast30).toBe(20);
    expect(out.resolvedLast30).toBe(3);
    expect(out.backlogDelta7).toBe(3); // 5 - 2
    expect(out.backlogDelta30).toBe(17); // 20 - 3
  });
});

// ── Panel 3: attorney load ───────────────────────────────────────────

describe("getAttorneyLoad()", () => {
  it("returns empty when no typed assignees are on the open queue", async () => {
    intakeTicketGroupBy.mockResolvedValueOnce([]);
    const out = await getAttorneyLoad("org1");
    expect(out).toEqual([]);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("joins names + per-assignee SLA posture, busiest first", async () => {
    intakeTicketGroupBy.mockResolvedValueOnce([
      { assignedToUserId: "u1", _count: { _all: 5 } },
      { assignedToUserId: "u2", _count: { _all: 2 } },
    ]);
    userFindMany.mockResolvedValueOnce([
      { id: "u1", name: "Rachel Adams" },
      { id: "u2", name: "Marcus Reid" },
    ]);
    intakeTicketFindMany.mockResolvedValueOnce([
      { assignedToUserId: "u1", slaStatus: "Breached" },
      { assignedToUserId: "u1", slaStatus: "At Risk" },
      { assignedToUserId: "u1", slaStatus: "On Track" },
      { assignedToUserId: "u2", slaStatus: "At Risk" },
    ]);

    const out = await getAttorneyLoad("org1");
    expect(out).toEqual([
      { userId: "u1", name: "Rachel Adams", open: 5, atRisk: 1, breached: 1 },
      { userId: "u2", name: "Marcus Reid", open: 2, atRisk: 1, breached: 0 },
    ]);
  });
});

// ── Panel 4: routing effectiveness ───────────────────────────────────

describe("getRoutingEffectiveness()", () => {
  it("maps rules and ISO-serialises lastFiredAt", async () => {
    intakeRoutingRuleFindMany.mockResolvedValueOnce([
      { id: "r1", name: "NDA auto-route", enabled: true, timesFired: 42, lastFiredAt: new Date("2026-10-01T12:00:00Z") },
      { id: "r2", name: "Dormant rule", enabled: false, timesFired: 0, lastFiredAt: null },
    ]);
    const out = await getRoutingEffectiveness("org1");
    expect(out[0]).toEqual({ id: "r1", name: "NDA auto-route", enabled: true, timesFired: 42, lastFiredAt: "2026-10-01T12:00:00.000Z" });
    expect(out[1].lastFiredAt).toBeNull();
  });
});

// ── Composer degradation ─────────────────────────────────────────────

describe("getExecutiveOperationsSummary()", () => {
  it("degrades a failed panel to its sentinel and lists it in panelErrors", async () => {
    // queueHealth throws; the rest succeed.
    intakeTicketGroupBy
      .mockRejectedValueOnce(new Error("db down")) // getQueueHealth status groupBy
      .mockResolvedValueOnce([]); // getAttorneyLoad groupBy → empty
    intakeTicketCount.mockResolvedValue(0);
    auditLogFindMany.mockResolvedValue([]);
    intakeRoutingRuleFindMany.mockResolvedValueOnce([]);

    const out = await getExecutiveOperationsSummary("org1", new Date("2026-10-05T00:00:00Z"));
    expect(out.panelErrors).toContain("queueHealth");
    expect(out.queueHealth.open).toBe(0); // sentinel
    expect(out.throughput.createdLast7).toBe(0);
    expect(out.attorneyLoad).toEqual([]);
    expect(out.routingEffectiveness).toEqual([]);
    expect(typeof out.asOf).toBe("string");
  });
});
