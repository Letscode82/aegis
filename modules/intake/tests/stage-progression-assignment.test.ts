/**
 * Phase 1b — typed assignment + stage progression audit.
 *
 * Two behaviors under test, both server-side via the `saveTicketsV8`
 * chokepoint:
 *
 *   1. `assignedToUserId` transitions write an
 *      `intake.ticket.assigned` audit row. The legacy free-text
 *      `assignedTo` is structural display data and does NOT trigger
 *      the audit on its own — only the typed FK is the
 *      ownership-change signal.
 *
 *   2. `stage` transitions write an `intake.ticket.stage_advanced`
 *      audit row. Covers the visible Kanban-column lifecycle:
 *      new → triage → assigned → review → complete.
 *
 * Prisma is mocked at the module boundary so the tests don't need a
 * DB. Audit calls are captured via the `logAudit` mock.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const personFindFirstMock = vi.fn();
const personUpsertMock = vi.fn();
const intakeTicketFindUniqueMock = vi.fn();
const intakeTicketUpsertMock = vi.fn();
const logAuditMock = vi.fn();
const getCurrentOrganizationMock = vi.fn();
const getCurrentUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    person: { findFirst: personFindFirstMock, upsert: personUpsertMock },
    intakeTicket: {
      findUnique: intakeTicketFindUniqueMock,
      upsert: intakeTicketUpsertMock,
      findMany: vi.fn(),
    },
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    agentRecommendation: { deleteMany: vi.fn(), create: vi.fn() },
    intakeConversation: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    userPreference: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
  logAudit: logAuditMock,
  getCurrentOrganization: getCurrentOrganizationMock,
  getCurrentUser: getCurrentUserMock,
  IntakeSource: { FORM: "FORM", EMAIL: "EMAIL", SLACK: "SLACK", API: "API", COPILOT: "COPILOT" },
  IntakeStatus: {
    AWAITING_TRIAGE: "AWAITING_TRIAGE",
    IN_REVIEW: "IN_REVIEW",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    ESCALATED: "ESCALATED",
    CLOSED: "CLOSED",
  },
  AgentRecommendationStatus: { PENDING: "PENDING", APPROVED: "APPROVED", REJECTED: "REJECTED" },
  ConversationRole: { USER: "USER", ASSISTANT: "ASSISTANT", SYSTEM: "SYSTEM" },
}));

const { intakeStorageSet } = await import("../src/storage/server");

const SESSION_USER = {
  id: "u-rachel",
  organizationId: "org1",
  email: "rachel@aegis-demo.example",
  name: "Rachel Adams",
};

beforeEach(() => {
  personFindFirstMock.mockReset();
  personUpsertMock.mockReset();
  intakeTicketFindUniqueMock.mockReset();
  intakeTicketUpsertMock.mockReset();
  logAuditMock.mockReset();
  getCurrentOrganizationMock.mockReset();
  getCurrentUserMock.mockReset();

  getCurrentOrganizationMock.mockResolvedValue({ id: "org1" });
  getCurrentUserMock.mockResolvedValue(SESSION_USER);
  // Person resolution doesn't matter for these tests — return a
  // stable id; both name/userId lookups can hit the same row.
  personFindFirstMock.mockResolvedValue({ id: "p-rachel" });
  personUpsertMock.mockResolvedValue({ id: "p-rachel" });
  intakeTicketUpsertMock.mockResolvedValue({ id: "REQ-1" });
  logAuditMock.mockResolvedValue(undefined);
});

function auditCallsFor(action: string) {
  return logAuditMock.mock.calls.filter((c) => c[0]?.action === action);
}

// ── intake.ticket.assigned audit ─────────────────────────────────────

describe("saveTicketsV8 — assignment audit (intake.ticket.assigned)", () => {
  it("fires when assignedToUserId transitions from null to a real User", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "AWAITING_TRIAGE",
      stage: "new",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([
        {
          id: "REQ-1",
          type: "NDA",
          from: "Alex",
          assignedToUserId: "u-rachel",
        },
      ]),
    );

    const calls = auditCallsFor("intake.ticket.assigned");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toMatchObject({
      action: "intake.ticket.assigned",
      resourceType: "IntakeTicket",
      resourceId: "REQ-1",
      beforeJson: { assignedToUserId: null },
      afterJson: { assignedToUserId: "u-rachel" },
    });
  });

  it("fires on reassignment (one User → another)", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: "u-marcus",
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([
        { id: "REQ-1", type: "NDA", from: "Alex", assignedToUserId: "u-rachel" },
      ]),
    );

    const calls = auditCallsFor("intake.ticket.assigned");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.beforeJson).toEqual({
      assignedToUserId: "u-marcus",
    });
    expect(calls[0]?.[0]?.afterJson).toEqual({
      assignedToUserId: "u-rachel",
    });
  });

  it("does NOT fire when assignedToUserId is unchanged", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: "u-rachel",
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([
        { id: "REQ-1", type: "NDA", from: "Alex", assignedToUserId: "u-rachel" },
      ]),
    );

    expect(auditCallsFor("intake.ticket.assigned")).toHaveLength(0);
  });

  it("does NOT fire on free-text `assigned` edits alone", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([
        {
          id: "REQ-1",
          type: "NDA",
          from: "Alex",
          assigned: "NDA Agent · Cockpit Queue",
          // assignedToUserId not set
        },
      ]),
    );

    expect(auditCallsFor("intake.ticket.assigned")).toHaveLength(0);
  });
});

// ── intake.ticket.stage_advanced audit ───────────────────────────────

describe("saveTicketsV8 — stage progression audit (intake.ticket.stage_advanced)", () => {
  it("fires on new → triage transition", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "AWAITING_TRIAGE",
      stage: "new",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([{ id: "REQ-1", type: "NDA", from: "Alex", stage: "triage" }]),
    );

    const calls = auditCallsFor("intake.ticket.stage_advanced");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.beforeJson).toEqual({ stage: "new" });
    expect(calls[0]?.[0]?.afterJson).toEqual({ stage: "triage" });
  });

  it("fires on triage → assigned transition (the agent-done flip)", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      stage: "triage",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([{ id: "REQ-1", type: "NDA", from: "Alex", stage: "assigned" }]),
    );

    const calls = auditCallsFor("intake.ticket.stage_advanced");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.afterJson).toEqual({ stage: "assigned" });
  });

  it("fires on review → complete (the attorney-approval Kanban flip)", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      stage: "review",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: "u-rachel",
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([
        {
          id: "REQ-1",
          type: "NDA",
          from: "Alex",
          stage: "complete",
          assignedToUserId: "u-rachel",
        },
      ]),
    );

    const calls = auditCallsFor("intake.ticket.stage_advanced");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]?.beforeJson).toEqual({ stage: "review" });
    expect(calls[0]?.[0]?.afterJson).toEqual({ stage: "complete" });
  });

  it("does NOT fire when stage is unchanged", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
    });

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([{ id: "REQ-1", type: "NDA", from: "Alex", stage: "assigned" }]),
    );

    expect(auditCallsFor("intake.ticket.stage_advanced")).toHaveLength(0);
  });

  it("does NOT fire on brand-new ticket creation (only the created event fires)", async () => {
    // before === null means the ticket doesn't exist; only
    // `intake.ticket.created` fires, not stage_advanced.
    intakeTicketFindUniqueMock.mockResolvedValueOnce(null);

    await intakeStorageSet(
      "aegis:tickets:v1",
      JSON.stringify([
        {
          id: "REQ-NEW",
          type: "NDA",
          from: "Alex",
          stage: "new",
          submittedTs: Date.now(),
        },
      ]),
    );

    expect(auditCallsFor("intake.ticket.stage_advanced")).toHaveLength(0);
    expect(auditCallsFor("intake.ticket.created")).toHaveLength(1);
  });
});
