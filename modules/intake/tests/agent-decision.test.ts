/**
 * AgentDecision lifecycle (Intake P2b — conservative-AI gate).
 *
 * Makes "no AI action without human approval" a schema fact:
 *   - a fresh recommendation creates a PENDING decision
 *   - approve → APPROVED (linked to the approval audit row)
 *   - edited-approve → APPROVED_WITH_OVERRIDE (+ overrideReason)
 *   - reject → REJECTED (no approver)
 *   - a resolved verdict is immutable (re-save is a no-op)
 *   - downstream gate: matter spawn proceeds only when APPROVED
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirstMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    agentDecision: {
      findFirst: findFirstMock,
      create: createMock,
      update: updateMock,
    },
  },
  sha256Hex: (s: string) => `hash(${s.length})`,
  AgentApprovalStatus: {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    APPROVED_WITH_OVERRIDE: "APPROVED_WITH_OVERRIDE",
    REJECTED: "REJECTED",
    AUTO_REJECTED: "AUTO_REJECTED",
  },
}));
vi.mock("@aegis/ai", () => ({ CLAUDE_MODEL: "claude-sonnet-4-6" }));

const {
  syncAgentDecisionForTicket,
  isTicketAgentActionApproved,
} = await import("../src/agent-decision/server");

const REC = {
  agentId: "nda-agent",
  confidence: 0.92,
  suggestedAction: "approve-and-send",
  draftedResponse: "Hi, NDA drafted.",
  reasoning: "Template fit.",
};

beforeEach(() => {
  findFirstMock.mockReset().mockResolvedValue(null);
  createMock.mockReset().mockImplementation(({ data }) => ({ id: "ad-new", ...data }));
  updateMock.mockReset().mockImplementation(({ data }) => ({ id: "ad-existing", ...data }));
});

describe("syncAgentDecisionForTicket — creation", () => {
  it("creates a PENDING decision when a fresh rec arrives with no action", async () => {
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: null,
    });
    expect(approved).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("PENDING");
    expect(data.resourceType).toBe("IntakeTicket");
    expect(data.resourceId).toBe("REQ-1");
    expect(data.agentName).toBe("nda-agent");
    expect(data.modelId).toBe("claude-sonnet-4-6");
    expect(data.modelVersion).toBe("live");
  });

  it("records a degraded fallback rec as modelVersion=degraded-fallback", async () => {
    await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: { ...REC, mock: true },
      action: null,
    });
    expect(createMock.mock.calls[0][0].data.modelVersion).toBe("degraded-fallback");
  });

  it("creates an already-APPROVED decision for approve-in-same-save (bulk)", async () => {
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "approved",
      actorId: "u-alex",
      auditLogId: "audit-1",
    });
    expect(approved).toBe(true);
    const data = createMock.mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("APPROVED");
    expect(data.approvedById).toBe("u-alex");
    expect(data.resultingAuditLogId).toBe("audit-1");
  });
});

describe("syncAgentDecisionForTicket — resolution of an existing PENDING", () => {
  beforeEach(() => {
    findFirstMock.mockResolvedValue({ id: "ad-existing", approvalStatus: "PENDING" });
  });

  it("approve → APPROVED, links approver + audit row", async () => {
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "approved",
      actorId: "u-alex",
      auditLogId: "audit-9",
    });
    expect(approved).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
    const data = updateMock.mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("APPROVED");
    expect(data.approvedById).toBe("u-alex");
    expect(data.resultingAuditLogId).toBe("audit-9");
  });

  it("edited-approve → APPROVED_WITH_OVERRIDE + overrideReason", async () => {
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "edited-approved",
      actorId: "u-alex",
    });
    expect(approved).toBe(true);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("APPROVED_WITH_OVERRIDE");
    expect(data.overrideReason).toMatch(/edited/i);
  });

  it("reject → REJECTED, no approver", async () => {
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "rejected",
      actorId: "u-alex",
    });
    expect(approved).toBe(false);
    const data = updateMock.mock.calls[0][0].data;
    expect(data.approvalStatus).toBe("REJECTED");
    expect(data.approvedById).toBeNull();
  });

  it("non-verdict actions (reassign/snooze) leave it PENDING", async () => {
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "reassigned",
    });
    expect(approved).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("syncAgentDecisionForTicket — verdict immutability", () => {
  it("does not re-resolve an already-APPROVED decision", async () => {
    findFirstMock.mockResolvedValue({ id: "ad-1", approvalStatus: "APPROVED" });
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "approved",
    });
    expect(approved).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("a previously-REJECTED decision stays rejected and gates downstream", async () => {
    findFirstMock.mockResolvedValue({ id: "ad-1", approvalStatus: "REJECTED" });
    const { approved } = await syncAgentDecisionForTicket({
      organizationId: "org1",
      ticketId: "REQ-1",
      rec: REC,
      action: "approved", // can't override a rejection
    });
    expect(approved).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("isTicketAgentActionApproved — the gate", () => {
  it("ungated (allowed) when no decision exists — non-AI ticket", async () => {
    findFirstMock.mockResolvedValue(null);
    const r = await isTicketAgentActionApproved("org1", "REQ-1");
    expect(r).toEqual({ gated: false, approved: true });
  });

  it("gated + approved for an APPROVED decision", async () => {
    findFirstMock.mockResolvedValue({ approvalStatus: "APPROVED" });
    const r = await isTicketAgentActionApproved("org1", "REQ-1");
    expect(r).toEqual({ gated: true, approved: true });
  });

  it("gated + blocked for a PENDING decision", async () => {
    findFirstMock.mockResolvedValue({ approvalStatus: "PENDING" });
    const r = await isTicketAgentActionApproved("org1", "REQ-1");
    expect(r).toEqual({ gated: true, approved: false });
  });

  it("gated + blocked for a REJECTED decision", async () => {
    findFirstMock.mockResolvedValue({ approvalStatus: "REJECTED" });
    const r = await isTicketAgentActionApproved("org1", "REQ-1");
    expect(r).toEqual({ gated: true, approved: false });
  });
});
