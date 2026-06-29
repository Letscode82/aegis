/**
 * Server-side agent execution (hardening). A ticket created server-side
 * (email / mailbox poll) is triaged in-process: the agent runs, an
 * AgentRecommendation + PENDING AgentDecision are persisted, agentProcessedAt
 * is stamped, and a chain-sealed audit row is written.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const recDeleteMany = vi.fn();
const recCreate = vi.fn();
const ticketUpdate = vi.fn();
const logAuditMock = vi.fn();
vi.mock("@aegis/db", () => ({
  prisma: {
    agentRecommendation: { deleteMany: recDeleteMany, create: recCreate },
    intakeTicket: { update: ticketUpdate },
  },
  logAudit: logAuditMock,
  AgentRecommendationStatus: { PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED", EDITED: "EDITED" },
}));

vi.mock("@aegis/ai/server", () => ({ ensureServerClaudeTransport: vi.fn() }));

const processMock = vi.fn();
vi.mock("../src/agents/index.js", () => ({ processTicketWithAgent: processMock }));

const syncMock = vi.fn();
vi.mock("../src/agent-decision/server", () => ({ syncAgentDecisionForTicket: syncMock }));

const { runAgentForTicketServer } = await import("../src/agents/run-server");

beforeEach(() => {
  recDeleteMany.mockReset().mockResolvedValue({});
  recCreate.mockReset().mockResolvedValue({});
  ticketUpdate.mockReset().mockResolvedValue({});
  logAuditMock.mockReset().mockResolvedValue("audit-1");
  processMock.mockReset();
  syncMock.mockReset().mockResolvedValue({ approved: false, decision: null });
});

const TICKET = { id: "REQ-1", from: "Dana", dept: "Sales", type: "NDA Request", priority: "Low", desc: "Mutual NDA with Acme." };

describe("runAgentForTicketServer()", () => {
  it("persists a PENDING recommendation + decision and audits when an agent matches", async () => {
    processMock.mockResolvedValue({
      agent: { id: "nda-agent", name: "NDA Agent" },
      recommendation: {
        agentId: "nda-agent",
        confidence: 0.95,
        suggestedAction: "approve-and-send",
        draftedResponse: "Here is your NDA…",
        reasoning: "Standard mutual NDA.",
        concerns: [],
        precedentLinks: [],
        alternativeTone: null,
        mock: false,
      },
    });

    const res = await runAgentForTicketServer("org1", TICKET);

    expect(res.agentId).toBe("nda-agent");
    expect(res.suggestedAction).toBe("approve-and-send");
    expect(res.degraded).toBe(false);

    // Recommendation persisted as PENDING.
    expect(recDeleteMany).toHaveBeenCalledWith({ where: { ticketId: "REQ-1" } });
    const recData = recCreate.mock.calls[0][0].data;
    expect(recData.agentId).toBe("nda-agent");
    expect(recData.status).toBe("PENDING");

    // Conservative-AI: a PENDING decision was synced (action null = not resolved).
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock.mock.calls[0][0].action).toBeNull();

    // agentProcessedAt stamped + AGENT-actor audit row.
    expect(ticketUpdate.mock.calls[0][0].data.agentProcessedAt).toBeInstanceOf(Date);
    const audit = logAuditMock.mock.calls.find((c) => c[0].action === "intake.recommendation.generated");
    expect(audit).toBeTruthy();
    expect(audit![0].actorType).toBe("AGENT");
    expect(audit![0].afterJson.agentId).toBe("nda-agent");
  });

  it("records a degraded recommendation when the agent fell back", async () => {
    processMock.mockResolvedValue({
      agent: { id: "vendor-intake-agent" },
      recommendation: {
        agentId: "vendor-intake-agent",
        confidence: 0.4,
        suggestedAction: "flag-for-review",
        draftedResponse: "",
        reasoning: "Screening unavailable.",
        mock: true,
      },
    });
    const res = await runAgentForTicketServer("org1", TICKET);
    expect(res.degraded).toBe(true);
    const audit = logAuditMock.mock.calls.find((c) => c[0].action === "intake.recommendation.generated");
    expect(audit![0].afterJson.degraded).toBe(true);
  });

  it("audits a no-match (and still stamps agentProcessedAt) when no agent handles it", async () => {
    processMock.mockResolvedValue({ agent: null, recommendation: null });
    const res = await runAgentForTicketServer("org1", { ...TICKET, type: "Other", desc: "random unclassifiable text" });
    expect(res.agentId).toBeNull();
    expect(recCreate).not.toHaveBeenCalled();
    expect(ticketUpdate.mock.calls[0][0].data.agentProcessedAt).toBeInstanceOf(Date);
    const audit = logAuditMock.mock.calls.find((c) => c[0].action === "intake.ticket.agent_no_match");
    expect(audit).toBeTruthy();
    expect(audit![0].actorType).toBe("SYSTEM");
  });
});
