/**
 * P1c-lite + P3-lite — server-side SLA breach detection + operations
 * aggregation. Prisma mocked at the module boundary.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ticketFindManyMock = vi.fn();
const ticketUpdateMock = vi.fn();
const ruleFindManyMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicket: { findMany: ticketFindManyMock, update: ticketUpdateMock },
    intakeRoutingRule: { findMany: ruleFindManyMock },
  },
  logAudit: logAuditMock,
  IntakeStatus: {
    AWAITING_TRIAGE: "AWAITING_TRIAGE",
    IN_REVIEW: "IN_REVIEW",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    ESCALATED: "ESCALATED",
    CLOSED: "CLOSED",
  },
}));

const { evaluateSlaBreaches, getSlaOperationsSummary } = await import(
  "../src/sla/server"
);

const HOUR = 3600 * 1000;
const now = Date.now();

beforeEach(() => {
  ticketFindManyMock.mockReset();
  ticketUpdateMock.mockReset().mockResolvedValue({});
  ruleFindManyMock.mockReset().mockResolvedValue([]);
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("evaluateSlaBreaches()", () => {
  it("escalates past-SLA tickets and writes the sla_breached + auto_escalated audit pair", async () => {
    ticketFindManyMock.mockResolvedValue([
      {
        id: "REQ-1",
        status: "AWAITING_TRIAGE",
        slaHours: 8,
        slaStatus: "At Risk",
        submittedAt: new Date(now - 9 * HOUR), // 9h old, 8h SLA → breach
      },
      {
        id: "REQ-2",
        status: "AWAITING_TRIAGE",
        slaHours: 24,
        slaStatus: "On Track",
        submittedAt: new Date(now - 2 * HOUR), // healthy
      },
    ]);

    const result = await evaluateSlaBreaches("org1");
    expect(result.scanned).toBe(2);
    expect(result.breached).toBe(1);
    expect(result.escalatedTicketIds).toEqual(["REQ-1"]);

    expect(ticketUpdateMock).toHaveBeenCalledWith({
      where: { id: "REQ-1" },
      data: { status: "ESCALATED", slaStatus: "Overdue" },
    });
    const actions = logAuditMock.mock.calls.map((c) => c[0].action);
    expect(actions).toEqual([
      "intake.ticket.sla_breached",
      "intake.ticket.auto_escalated",
    ]);
    // System actor on both rows — no human did this.
    for (const call of logAuditMock.mock.calls) {
      expect(call[0].actorType).toBe("SYSTEM");
      expect(call[0].actorId).toBeNull();
    }
  });

  it("excludes escalated / closed tickets from the scan population (idempotency)", async () => {
    ticketFindManyMock.mockResolvedValue([]);
    await evaluateSlaBreaches("org1");
    const where = ticketFindManyMock.mock.calls[0][0].where;
    expect(where.status.notIn).toContain("ESCALATED");
    expect(where.status.notIn).toContain("CLOSED");
    expect(where.status.notIn).toContain("APPROVED");
    expect(where.stage).toEqual({ not: "complete" });
  });
});

describe("getSlaOperationsSummary()", () => {
  it("computes queue health server-side and groups workload by typed assignee", async () => {
    ticketFindManyMock.mockResolvedValue([
      {
        id: "REQ-1",
        status: "AWAITING_TRIAGE",
        stage: "assigned",
        triagedBy: null,
        slaHours: 8,
        submittedAt: new Date(now - 9 * HOUR), // overdue
        assignedToUserId: "u-lena",
        assignedToUser: { name: "Lena Pérez" },
      },
      {
        id: "REQ-2",
        status: "AWAITING_TRIAGE",
        stage: "new",
        triagedBy: null,
        slaHours: 10,
        submittedAt: new Date(now - 8 * HOUR), // 80% → at risk
        assignedToUserId: "u-lena",
        assignedToUser: { name: "Lena Pérez" },
      },
      {
        id: "REQ-3",
        status: "ESCALATED",
        stage: "review",
        triagedBy: "Someone",
        slaHours: 24,
        submittedAt: new Date(now - 1 * HOUR),
        assignedToUserId: null,
        assignedToUser: null,
      },
    ]);
    ruleFindManyMock.mockResolvedValue([
      { id: "r1", name: "NDA fast lane", enabled: true, timesFired: 31, lastFiredAt: null },
    ]);

    const s = await getSlaOperationsSummary("org1");
    expect(s.queue).toEqual({
      open: 3,
      awaitingTriage: 2, // new + assigned, both untriaged
      escalated: 1,
      overdue: 1,
      atRisk: 1,
    });
    expect(s.attorneyWorkload).toEqual([
      { userId: "u-lena", name: "Lena Pérez", open: 2, overdue: 1, atRisk: 1 },
    ]);
    expect(s.unassignedOpen).toBe(1);
    expect(s.ruleEffectiveness[0]).toMatchObject({
      id: "r1",
      timesFired: 31,
    });
  });
});
