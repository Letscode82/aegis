/**
 * P2a — routing rules inside the saveTicketsV8 chokepoint.
 *
 * Asserts the integration behavior the pure-evaluator tests can't:
 *   - rule effects land on the upserted row (priority / SLA /
 *     assignee + assignedTo mirror + firedRulesJson stamp);
 *   - each newly-fired rule writes a SYSTEM-actor
 *     `intake.routing_rule.fired` audit row and bumps counters;
 *   - re-saving the same ticket does NOT re-audit (idempotent);
 *   - triaged tickets are never touched by rules.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const intakeTicketFindUniqueMock = vi.fn();
const intakeTicketUpsertMock = vi.fn();
const routingRuleFindManyMock = vi.fn();
const routingRuleUpdateManyMock = vi.fn();
const logAuditMock = vi.fn();
const getCurrentOrganizationMock = vi.fn();
const getCurrentUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    person: {
      findFirst: vi.fn().mockResolvedValue({ id: "p-1" }),
      upsert: vi.fn().mockResolvedValue({ id: "p-1" }),
    },
    intakeTicket: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: intakeTicketFindUniqueMock,
      upsert: intakeTicketUpsertMock,
      findMany: vi.fn(),
    },
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    agentRecommendation: { deleteMany: vi.fn(), create: vi.fn() },
    intakeConversation: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    userPreference: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    intakeRoutingRule: {
      findMany: routingRuleFindManyMock,
      updateMany: routingRuleUpdateManyMock,
    },
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
  MatterType: {
    LITIGATION: "LITIGATION", TRANSACTIONAL: "TRANSACTIONAL", MA: "MA", IP: "IP",
    EMPLOYMENT: "EMPLOYMENT", REGULATORY: "REGULATORY", INVESTIGATION: "INVESTIGATION",
    ADVISORY: "ADVISORY", OTHER: "OTHER",
  },
}));
vi.mock("@aegis/matter", () => ({
  createMatter: vi.fn().mockResolvedValue({ id: "m-test", matterNumber: "M-2026-TEST" }),
}));

const { intakeStorageSet } = await import("../src/storage/server");

// DB row shape for loadEnabledRoutingRules (RULE_SELECT projection).
const NDA_RULE_ROW = {
  id: "rule-nda-sla",
  name: "NDA fast lane (8h SLA)",
  description: null,
  enabled: true,
  evalOrder: 30,
  matchType: "NDA Request",
  matchPriority: null,
  matchDepartment: null,
  matchKeyword: null,
  setAssigneeUserId: null,
  setPriority: null,
  setSlaHours: 8,
  timesFired: 0,
  lastFiredAt: null,
  assignee: null,
};

function ticketsPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify([
    {
      id: "REQ-9001",
      from: "Alex",
      type: "NDA Request",
      priority: "Low",
      status: "Awaiting Triage",
      stage: "new",
      desc: "Standard mutual NDA with Acme",
      slaHours: 24,
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  intakeTicketFindUniqueMock.mockReset();
  intakeTicketUpsertMock.mockReset().mockResolvedValue({ id: "REQ-9001" });
  routingRuleFindManyMock.mockReset().mockResolvedValue([NDA_RULE_ROW]);
  routingRuleUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
  logAuditMock.mockReset().mockResolvedValue(undefined);
  getCurrentOrganizationMock.mockReset().mockResolvedValue({ id: "org1" });
  getCurrentUserMock.mockReset().mockResolvedValue({
    id: "u-alex",
    organizationId: "org1",
    email: "alex@x.example",
    name: "Alex Nguyen",
  });
});

function firedAudits() {
  return logAuditMock.mock.calls.filter(
    (c) => c[0]?.action === "intake.routing_rule.fired",
  );
}

describe("saveTicketsV8 — routing rules", () => {
  it("applies rule actions to a brand-new untriaged ticket and stamps firedRulesJson", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue(null); // create path
    await intakeStorageSet("aegis:tickets:v1", ticketsPayload());

    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    expect(upsert.create.slaHours).toBe(8); // rule tightened 24 → 8
    const stamp = upsert.create.firedRulesJson;
    expect(stamp.ruleIds).toEqual(["rule-nda-sla"]);
    expect(stamp.summaries[0]).toMatchObject({
      id: "rule-nda-sla",
      actions: ["SLA → 8h"],
    });
  });

  it("writes one SYSTEM-actor audit row per firing and bumps counters", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue(null);
    await intakeStorageSet("aegis:tickets:v1", ticketsPayload());

    const rows = firedAudits();
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toMatchObject({
      actorId: null,
      actorType: "SYSTEM",
      action: "intake.routing_rule.fired",
      resourceId: "REQ-9001",
      afterJson: {
        ruleId: "rule-nda-sla",
        ruleName: "NDA fast lane (8h SLA)",
        actions: ["SLA → 8h"],
      },
    });
    expect(routingRuleUpdateManyMock).toHaveBeenCalledWith({
      where: { id: { in: ["rule-nda-sla"] } },
      data: { timesFired: { increment: 1 }, lastFiredAt: expect.any(Date) },
    });
  });

  it("does not re-audit a rule already recorded in firedRulesJson", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "new",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
      firedRulesJson: {
        ruleIds: ["rule-nda-sla"],
        firedAt: "2026-06-09T00:00:00.000Z",
        summaries: [
          { id: "rule-nda-sla", name: "NDA fast lane (8h SLA)", actions: ["SLA → 8h"] },
        ],
      },
    });
    // Stale client payload still carries the pre-routing 24h SLA.
    await intakeStorageSet("aegis:tickets:v1", ticketsPayload());

    // Reconverges the SLA but stays silent on audit + counters.
    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    expect(upsert.update.slaHours).toBe(8);
    expect(firedAudits()).toHaveLength(0);
    expect(routingRuleUpdateManyMock).not.toHaveBeenCalled();
  });

  it("never touches a triaged ticket", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "complete",
      triagedAction: "approved",
      triagedBy: "Alex Nguyen",
      assignedToUserId: null,
      firedRulesJson: null,
    });
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({ triagedAction: "approved", triagedBy: "Alex Nguyen" }),
    );

    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    expect(upsert.update.slaHours).toBe(24); // untouched
    expect(firedAudits()).toHaveLength(0);
  });
});
