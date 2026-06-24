/**
 * Per-agent health metrics (Intake P2b hardening). Aggregates
 * AgentRecommendation (core stats) + AgentDecision (degraded rate).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const recFindManyMock = vi.fn();
const decisionFindManyMock = vi.fn();
vi.mock("@aegis/db", () => ({
  prisma: {
    agentRecommendation: { findMany: recFindManyMock },
    agentDecision: { findMany: decisionFindManyMock },
  },
}));

const { getAgentMetrics } = await import("../src/agent-metrics/server");

beforeEach(() => {
  recFindManyMock.mockReset().mockResolvedValue([]);
  decisionFindManyMock.mockReset().mockResolvedValue([]);
});

describe("getAgentMetrics()", () => {
  it("computes produced / accept-rate / avg-confidence per agent", async () => {
    recFindManyMock.mockResolvedValue([
      { agentId: "nda-agent", confidence: 0.9, status: "APPROVED" },
      { agentId: "nda-agent", confidence: 0.8, status: "EDITED" }, // counts as approved
      { agentId: "nda-agent", confidence: 0.7, status: "REJECTED" },
      { agentId: "nda-agent", confidence: 0.6, status: "PENDING" }, // not reviewed
      { agentId: "faq-agent", confidence: 0.95, status: "APPROVED" },
    ]);
    const out = await getAgentMetrics("org1", 7, Date.parse("2026-06-24T00:00:00Z"));
    const nda = out.agents.find((a) => a.agentId === "nda-agent")!;
    expect(nda.produced).toBe(4);
    expect(nda.approved).toBe(2); // APPROVED + EDITED
    expect(nda.rejected).toBe(1);
    expect(nda.pending).toBe(1);
    expect(nda.acceptRate).toBe(0.67); // 2 / (2+1)
    expect(nda.avgConfidence).toBe(0.75); // (0.9+0.8+0.7+0.6)/4
    // Sorted by produced desc → nda first.
    expect(out.agents[0].agentId).toBe("nda-agent");
  });

  it("returns null acceptRate when nothing has been reviewed", async () => {
    recFindManyMock.mockResolvedValue([
      { agentId: "policy-qa-agent", confidence: 0.5, status: "PENDING" },
    ]);
    const out = await getAgentMetrics("org1", 7);
    expect(out.agents[0].acceptRate).toBeNull();
  });

  it("computes degradedRate from AgentDecision modelVersion", async () => {
    recFindManyMock.mockResolvedValue([
      { agentId: "faq-agent", confidence: 0.9, status: "APPROVED" },
    ]);
    decisionFindManyMock.mockResolvedValue([
      { agentName: "faq-agent", modelVersion: "live" },
      { agentName: "faq-agent", modelVersion: "degraded-fallback" },
      { agentName: "faq-agent", modelVersion: "degraded-fallback" },
    ]);
    const out = await getAgentMetrics("org1", 7);
    const faq = out.agents.find((a) => a.agentId === "faq-agent")!;
    expect(faq.degradedRate).toBe(0.67); // 2 of 3
  });

  it("degradedRate is null when no decisions exist for the agent", async () => {
    recFindManyMock.mockResolvedValue([
      { agentId: "nda-agent", confidence: 0.9, status: "APPROVED" },
    ]);
    const out = await getAgentMetrics("org1", 7);
    expect(out.agents[0].degradedRate).toBeNull();
  });

  it("scopes both queries to the org and the time window", async () => {
    await getAgentMetrics("org1", 14, Date.parse("2026-06-24T00:00:00Z"));
    const recWhere = recFindManyMock.mock.calls[0][0].where;
    expect(recWhere.ticket.organizationId).toBe("org1");
    expect(recWhere.createdAt.gte).toBeInstanceOf(Date);
    const decWhere = decisionFindManyMock.mock.calls[0][0].where;
    expect(decWhere.organizationId).toBe("org1");
    expect(decWhere.resourceType).toBe("IntakeTicket");
    // 14-day window.
    const expectedSince = Date.parse("2026-06-24T00:00:00Z") - 14 * 86400000;
    expect(recWhere.createdAt.gte.getTime()).toBe(expectedSince);
  });
});
