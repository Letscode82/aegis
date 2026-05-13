/**
 * Unit tests for the AI Operations summary service.
 *
 * Prisma is mocked at the module boundary; the tests exercise each
 * panel's query composition + result shape independently and via the
 * top-level composer.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Prisma mock surface ──────────────────────────────────────────────

const auditLogFindMany = vi.fn();
const auditLogGroupBy = vi.fn();
const intakeTicketFindMany = vi.fn();
const userFindMany = vi.fn();
const agentRecommendationFindMany = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    auditLog: { findMany: auditLogFindMany, groupBy: auditLogGroupBy },
    intakeTicket: { findMany: intakeTicketFindMany },
    user: { findMany: userFindMany },
    agentRecommendation: { findMany: agentRecommendationFindMany },
  },
}));

// Import AFTER vi.mock so the service picks up the mocked prisma.
const {
  getRecentAgentActivity,
  getAgentScorecard,
  getPendingReviewQueue,
  getAIOperationsSummary,
  ACTIVITY_ACTIONS,
} = await import("../src/ai-ops/summary");

beforeEach(() => {
  auditLogFindMany.mockReset();
  auditLogGroupBy.mockReset();
  intakeTicketFindMany.mockReset();
  userFindMany.mockReset();
  agentRecommendationFindMany.mockReset();
});

// ── Panel A: activity feed ───────────────────────────────────────────

describe("getRecentAgentActivity()", () => {
  it("returns an empty array when AuditLog is empty", async () => {
    auditLogFindMany.mockResolvedValueOnce([]);
    const out = await getRecentAgentActivity("org1");
    expect(out).toEqual([]);
    // Joins are skipped when there are no rows.
    expect(intakeTicketFindMany).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("joins tickets + users + latest confidence into each row", async () => {
    const t = new Date("2026-05-13T10:00:00Z");
    auditLogFindMany.mockResolvedValueOnce([
      {
        id: "a1",
        action: "intake.recommendation.approved",
        resourceId: "REQ-1",
        actorId: "u1",
        actorType: "USER",
        timestamp: t,
      },
      {
        id: "a2",
        action: "intake.ticket.created",
        resourceId: "REQ-2",
        actorId: null,
        actorType: "SYSTEM",
        timestamp: t,
      },
    ]);
    intakeTicketFindMany.mockResolvedValueOnce([
      { id: "REQ-1", description: "Short desc", type: "NDA" },
      { id: "REQ-2", description: "Other", type: "Contract" },
    ]);
    userFindMany.mockResolvedValueOnce([{ id: "u1", name: "Marcus Reid" }]);
    agentRecommendationFindMany.mockResolvedValueOnce([
      // Two recs for REQ-1 — orderBy desc means first is latest.
      { ticketId: "REQ-1", confidence: 0.91, createdAt: t },
      { ticketId: "REQ-1", confidence: 0.5, createdAt: new Date(t.getTime() - 1000) },
    ]);

    const out = await getRecentAgentActivity("org1");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "a1",
      ticketId: "REQ-1",
      ticketType: "NDA",
      ticketTitle: "Short desc",
      actorName: "Marcus Reid",
      actorType: "USER",
      confidence: 0.91,
    });
    expect(out[1]).toMatchObject({
      ticketId: "REQ-2",
      actorName: "System",
      actorType: "SYSTEM",
      confidence: null, // no rec rows for REQ-2
    });
  });

  it("truncates long ticket descriptions", async () => {
    const longDesc = "x".repeat(200);
    auditLogFindMany.mockResolvedValueOnce([
      {
        id: "a1",
        action: "intake.ticket.created",
        resourceId: "REQ-1",
        actorId: "u1",
        actorType: "USER",
        timestamp: new Date(),
      },
    ]);
    intakeTicketFindMany.mockResolvedValueOnce([
      { id: "REQ-1", description: longDesc, type: "NDA" },
    ]);
    userFindMany.mockResolvedValueOnce([{ id: "u1", name: "Alex" }]);
    agentRecommendationFindMany.mockResolvedValueOnce([]);

    const out = await getRecentAgentActivity("org1");
    expect(out[0]?.ticketTitle?.length).toBeLessThanOrEqual(80);
    expect(out[0]?.ticketTitle?.endsWith("…")).toBe(true);
  });

  it("falls back to 'Unknown user' for missing User row", async () => {
    auditLogFindMany.mockResolvedValueOnce([
      {
        id: "a1",
        action: "intake.ticket.created",
        resourceId: "REQ-1",
        actorId: "u-missing",
        actorType: "USER",
        timestamp: new Date(),
      },
    ]);
    intakeTicketFindMany.mockResolvedValueOnce([]);
    userFindMany.mockResolvedValueOnce([]); // not found
    agentRecommendationFindMany.mockResolvedValueOnce([]);

    const out = await getRecentAgentActivity("org1");
    expect(out[0]?.actorName).toBe("Unknown user");
    expect(out[0]?.ticketTitle).toBeNull(); // missing ticket
  });
});

// ── Panel B: scorecard ───────────────────────────────────────────────

describe("getAgentScorecard()", () => {
  const NOW = new Date("2026-05-13T12:00:00Z");

  function mockEmptyJoins() {
    auditLogFindMany.mockResolvedValue([]); // any further call
    agentRecommendationFindMany.mockResolvedValue([]);
  }

  it("returns null metrics + zero events on an empty log", async () => {
    auditLogGroupBy.mockResolvedValueOnce([]);
    mockEmptyJoins();
    const s = await getAgentScorecard("org1", NOW);
    expect(s).toEqual({
      accuracy: null,
      coverage: null,
      avgReviewTimeMs: null,
      escalationRate: null,
      agentEvents: 0,
    });
  });

  it("computes accuracy = (approved + edited) / (approved + edited + rejected)", async () => {
    auditLogGroupBy.mockResolvedValueOnce([
      { action: "intake.recommendation.approved",        _count: { _all: 6 } },
      { action: "intake.recommendation.edited_approved", _count: { _all: 2 } },
      { action: "intake.recommendation.rejected",        _count: { _all: 2 } },
      { action: "intake.ticket.created",                 _count: { _all: 10 } },
    ]);
    mockEmptyJoins();
    const s = await getAgentScorecard("org1", NOW);
    expect(s.accuracy).toBeCloseTo(8 / 10);
    expect(s.agentEvents).toBe(20);
  });

  it("computes coverage = tickets-with-rec / tickets-created", async () => {
    auditLogGroupBy.mockResolvedValueOnce([]);
    // 1st findMany call: created rows. 2nd: recentCreated for review time.
    // 3rd: escalated distinct. 4th: reviews for review time.
    auditLogFindMany
      .mockResolvedValueOnce([
        { resourceId: "T1" },
        { resourceId: "T2" },
        { resourceId: "T3" },
        { resourceId: "T1" }, // duplicate — distinct logic happens in our code
      ])
      .mockResolvedValueOnce([]) // escalatedDistinct
      .mockResolvedValueOnce([]) // recentCreated
      .mockResolvedValueOnce([]); // reviews

    agentRecommendationFindMany.mockResolvedValueOnce([
      { ticketId: "T1" },
      { ticketId: "T2" },
    ]); // 2 of 3 distinct created tickets covered

    const s = await getAgentScorecard("org1", NOW);
    expect(s.coverage).toBeCloseTo(2 / 3);
  });

  it("computes avgReviewTimeMs from created→first-review pairs", async () => {
    auditLogGroupBy.mockResolvedValueOnce([]);
    // createdRows (for coverage)
    auditLogFindMany
      .mockResolvedValueOnce([{ resourceId: "T1" }, { resourceId: "T2" }])
      .mockResolvedValueOnce([]) // escalatedDistinct
      .mockResolvedValueOnce([
        // recentCreated
        { resourceId: "T1", timestamp: new Date("2026-05-13T10:00:00Z") },
        { resourceId: "T2", timestamp: new Date("2026-05-13T11:00:00Z") },
      ])
      .mockResolvedValueOnce([
        // reviews — T1 reviewed 10min later, T2 has no review
        { resourceId: "T1", timestamp: new Date("2026-05-13T10:10:00Z") },
      ]);
    agentRecommendationFindMany.mockResolvedValueOnce([]); // skip coverage

    const s = await getAgentScorecard("org1", NOW);
    expect(s.avgReviewTimeMs).toBe(10 * 60 * 1000); // 10min in ms
  });

  it("computes escalationRate = escalated / created", async () => {
    auditLogGroupBy.mockResolvedValueOnce([]);
    auditLogFindMany
      .mockResolvedValueOnce([
        { resourceId: "T1" },
        { resourceId: "T2" },
        { resourceId: "T3" },
        { resourceId: "T4" },
      ])
      .mockResolvedValueOnce([{ resourceId: "T1" }, { resourceId: "T2" }]) // 2 escalated
      .mockResolvedValueOnce([]) // recentCreated
      .mockResolvedValueOnce([]); // reviews
    agentRecommendationFindMany.mockResolvedValueOnce([]);

    const s = await getAgentScorecard("org1", NOW);
    expect(s.escalationRate).toBeCloseTo(0.5);
  });
});

// ── Panel C: pending review ──────────────────────────────────────────

describe("getPendingReviewQueue()", () => {
  it("returns [] when no tickets have ever been created", async () => {
    auditLogFindMany.mockResolvedValueOnce([]);
    const out = await getPendingReviewQueue("org1");
    expect(out).toEqual([]);
  });

  it("excludes tickets that have any human-review action", async () => {
    auditLogFindMany
      // distinct created
      .mockResolvedValueOnce([
        { resourceId: "T1" },
        { resourceId: "T2" },
        { resourceId: "T3" },
      ])
      // distinct reviewed — T2 has been approved, exclude it
      .mockResolvedValueOnce([{ resourceId: "T2" }]);
    intakeTicketFindMany.mockResolvedValueOnce([
      {
        id: "T1",
        type: "NDA",
        description: "first",
        submittedAt: new Date("2026-05-13T11:00:00Z"),
        requester: { name: "Alex" },
        recommendations: [
          { agentId: "nda", confidence: 0.8, suggestedAction: "approve-and-send" },
        ],
      },
      {
        id: "T3",
        type: "Contract",
        description: "third",
        submittedAt: new Date("2026-05-13T10:00:00Z"),
        requester: { name: "Sam" },
        recommendations: [],
      },
    ]);

    const out = await getPendingReviewQueue("org1");
    const ids = out.map((r) => r.ticketId);
    expect(ids).toEqual(["T1", "T3"]);
    expect(ids).not.toContain("T2");
    expect(out[0]?.classification).toBe("approve-and-send");
    expect(out[0]?.confidence).toBe(0.8);
    expect(out[1]?.classification).toBeNull(); // no rec on T3
  });

  it("computes waitingMs from submittedAt", async () => {
    const submitted = new Date(Date.now() - 5 * 60 * 1000); // 5min ago
    auditLogFindMany
      .mockResolvedValueOnce([{ resourceId: "T1" }])
      .mockResolvedValueOnce([]);
    intakeTicketFindMany.mockResolvedValueOnce([
      {
        id: "T1",
        type: "NDA",
        description: "x",
        submittedAt: submitted,
        requester: { name: "Alex" },
        recommendations: [],
      },
    ]);
    const out = await getPendingReviewQueue("org1");
    expect(out[0]?.waitingMs).toBeGreaterThan(4 * 60 * 1000);
    expect(out[0]?.waitingMs).toBeLessThan(6 * 60 * 1000);
  });
});

// ── Composer ─────────────────────────────────────────────────────────

describe("getAIOperationsSummary()", () => {
  it("returns the documented shape, even when every panel is empty", async () => {
    auditLogFindMany.mockResolvedValue([]);
    auditLogGroupBy.mockResolvedValueOnce([]);
    intakeTicketFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([]);
    agentRecommendationFindMany.mockResolvedValue([]);

    const out = await getAIOperationsSummary("org1");
    expect(out.activity).toEqual([]);
    expect(out.pendingReview).toEqual([]);
    expect(out.scorecard).toMatchObject({
      accuracy: null,
      coverage: null,
      avgReviewTimeMs: null,
      escalationRate: null,
      agentEvents: 0,
    });
    expect(typeof out.asOf).toBe("string");
  });

  it("exposes the curated action set used by both server and UI", () => {
    expect(ACTIVITY_ACTIONS).toContain("intake.ticket.created");
    expect(ACTIVITY_ACTIONS).toContain("intake.recommendation.approved");
    expect(ACTIVITY_ACTIONS).toContain("intake.ticket.escalated");
    expect(ACTIVITY_ACTIONS).toContain("intake.ticket.closed");
  });
});
