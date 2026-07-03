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
const intakeTicketUpdateMock = vi.fn();
const intakeTicketHandoffCreateMock = vi.fn();
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
      update: intakeTicketUpdateMock,
      findUnique: intakeTicketFindUniqueMock,
      upsert: intakeTicketUpsertMock,
      findMany: vi.fn(),
    },
    intakeTicketHandoff: { create: intakeTicketHandoffCreateMock },
    auditLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    agentRecommendation: { deleteMany: vi.fn(), create: vi.fn() },
    intakeConversation: { deleteMany: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    userPreference: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    agentDecision: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "ad-1", approvalStatus: "PENDING" }), update: vi.fn().mockResolvedValue({ id: "ad-1", approvalStatus: "APPROVED" }) },
    intakeRoutingRule: {
      findMany: routingRuleFindManyMock,
      updateMany: routingRuleUpdateManyMock,
    },
  },
  logAudit: logAuditMock,
  getCurrentOrganization: getCurrentOrganizationMock,
  getCurrentUser: getCurrentUserMock,
  sha256Hex: (s: string) => `sha-${s.length}`,
  AgentApprovalStatus: {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    APPROVED_WITH_OVERRIDE: "APPROVED_WITH_OVERRIDE",
    REJECTED: "REJECTED",
  },
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
  intakeTicketUpdateMock.mockReset().mockResolvedValue({});
  intakeTicketHandoffCreateMock.mockReset().mockResolvedValue({ id: "ho-1" });
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

describe("saveTicketsV8 — agent no-match audit (P2b)", () => {
  function noMatchAudits() {
    return logAuditMock.mock.calls.filter(
      (c) => c[0]?.action === "intake.ticket.agent_no_match",
    );
  }

  it("writes a SYSTEM no-match audit on first agent processing with no match", async () => {
    // Ticket already exists (created on a prior save), agent hasn't run yet.
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "triage",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
      firedRulesJson: null,
      agentProcessedAt: null,
    });
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        type: "Other",
        desc: "A novel situation no agent covers",
        stage: "assigned",
        agentProcessedAt: Date.now(),
        agentOutcome: "no-match",
      }),
    );
    const rows = noMatchAudits();
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toMatchObject({
      actorType: "SYSTEM",
      actorId: null,
      action: "intake.ticket.agent_no_match",
      resourceId: "REQ-9001",
    });
  });

  it("does NOT audit when an agent matched", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "triage",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
      firedRulesJson: null,
      agentProcessedAt: null,
    });
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        stage: "assigned",
        agentProcessedAt: Date.now(),
        agentOutcome: "matched",
      }),
    );
    expect(noMatchAudits()).toHaveLength(0);
  });

  it("does NOT re-audit on a later save (deduped by first-processing transition)", async () => {
    // Agent already processed this ticket previously.
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      assignedToUserId: null,
      firedRulesJson: null,
      agentProcessedAt: new Date(Date.now() - 60000),
    });
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        type: "Other",
        desc: "A novel situation no agent covers",
        stage: "assigned",
        agentProcessedAt: Date.now(),
        agentOutcome: "no-match",
      }),
    );
    expect(noMatchAudits()).toHaveLength(0);
  });
});

describe("saveTicketsV8 — auto baton-pass (W2-2)", () => {
  function handoffAudits() {
    return logAuditMock.mock.calls.filter(
      (c) => c[0]?.action === "intake.ticket.handoff",
    );
  }
  const unprocessedBefore = {
    status: "AWAITING_TRIAGE",
    stage: "triage",
    triagedAction: null,
    triagedBy: null,
    assignedToUserId: null,
    firedRulesJson: null,
    agentProcessedAt: null,
    handoffHolder: null,
    handoffUserId: null,
  };

  it("writes two AGENT ledger rows + denormalized holder + one audit on first processing (no-match)", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue(unprocessedBefore);
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        type: "Other",
        desc: "A novel situation no agent covers",
        stage: "assigned",
        agentProcessedAt: Date.now(),
        agentOutcome: "no-match",
      }),
    );
    expect(intakeTicketHandoffCreateMock).toHaveBeenCalledTimes(2);
    const [pass1, pass2] = intakeTicketHandoffCreateMock.mock.calls.map(
      (c) => c[0].data,
    );
    expect(pass1).toMatchObject({
      ticketId: "REQ-9001",
      fromHolder: null,
      toHolder: "agent",
      actorId: null,
      actorType: "AGENT",
    });
    expect(pass2).toMatchObject({
      fromHolder: "agent",
      toHolder: "queue",
      toUserId: null,
      actorType: "AGENT",
    });
    // Denormalized holder lands on the ticket.
    expect(intakeTicketUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "REQ-9001" },
        data: expect.objectContaining({
          handoffHolder: "queue",
          handoffUserId: null,
        }),
      }),
    );
    // One summarizing chain-sealed audit row, AGENT actor.
    const audits = handoffAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0][0]).toMatchObject({
      actorType: "AGENT",
      actorId: null,
      afterJson: { holder: "queue", holderUserId: null },
      metadata: expect.objectContaining({ auto: "agent-pipeline", outcome: "no-match" }),
    });
  });

  it("hands a drafted rec to the routed assignee and links the AgentDecision", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue(unprocessedBefore);
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        stage: "assigned",
        assignedToUserId: "u-maya",
        agentProcessedAt: Date.now(),
        agentOutcome: "matched",
        agentRecommendation: {
          agentId: "nda-agent",
          confidence: 92,
          suggestedAction: "approve",
          draftedResponse: "Draft NDA attached.",
          reasoning: "Standard mutual NDA.",
        },
      }),
    );
    expect(intakeTicketHandoffCreateMock).toHaveBeenCalledTimes(2);
    const pass2 = intakeTicketHandoffCreateMock.mock.calls[1][0].data;
    expect(pass2).toMatchObject({
      fromHolder: "agent",
      toHolder: "human",
      toUserId: "u-maya",
      actorType: "AGENT",
      agentDecisionId: "ad-1", // from the agentDecision.create mock
    });
    expect(intakeTicketUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          handoffHolder: "human",
          handoffUserId: "u-maya",
        }),
      }),
    );
  });

  it("does NOT write ledger rows on a later save (deduped by first-processing transition)", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue({
      ...unprocessedBefore,
      stage: "assigned",
      agentProcessedAt: new Date(Date.now() - 60000),
      handoffHolder: "queue",
    });
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        stage: "assigned",
        agentProcessedAt: Date.now(),
        agentOutcome: "no-match",
      }),
    );
    expect(intakeTicketHandoffCreateMock).not.toHaveBeenCalled();
    expect(handoffAudits()).toHaveLength(0);
  });
});

describe("saveTicketsV8 — escalation + approval gate (W2-5)", () => {
  const ESCALATE_RULE_ROW = {
    ...NDA_RULE_ROW,
    id: "rule-escalate",
    name: "Litigation → GC",
    matchType: "Litigation Notice",
    setSlaHours: null,
    escalateToUserId: "u-gc",
    escalateTo: { name: "Mark Williams" },
  };

  it("escalate rule assigns + raises + flips status to ESCALATED with audit", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue(null); // create path
    routingRuleFindManyMock.mockResolvedValue([ESCALATE_RULE_ROW]);
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({ type: "Litigation Notice", desc: "We have been served" }),
    );
    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    expect(upsert.create.status).toBe("ESCALATED");
    expect(upsert.create.priority).toBe("Critical");
    expect(upsert.create.assignedToUserId).toBe("u-gc");
    // Fired-rule audit carries the escalate action description.
    const fired = logAuditMock.mock.calls.filter(
      (c) => c[0]?.action === "intake.routing_rule.fired",
    );
    expect(fired).toHaveLength(1);
    expect(fired[0][0].afterJson.actions).toContain("escalate → Mark Williams");
  });

  it("requireApprovalFrom rule stamps the gate onto the ticket", async () => {
    intakeTicketFindUniqueMock.mockResolvedValue(null);
    routingRuleFindManyMock.mockResolvedValue([
      {
        ...NDA_RULE_ROW,
        id: "rule-gate",
        name: "NDA drafts need GC sign-off",
        setSlaHours: null,
        requireApprovalFromUserId: "u-gc",
        approver: { name: "Mark Williams" },
      },
    ]);
    await intakeStorageSet("aegis:tickets:v1", ticketsPayload());
    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    expect(upsert.create.approvalGateUserId).toBe("u-gc");
  });

  it("blocks an approve attempt by anyone but the gate user and audits it", async () => {
    // Gate says u-gc; the session actor is u-alex.
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      triagedAt: null,
      assignedToUserId: null,
      firedRulesJson: null,
      approvalGateUserId: "u-gc",
    });
    routingRuleFindManyMock.mockResolvedValue([]);
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        status: "Approved",
        triagedAction: "approved",
        triagedBy: "You (Alex Nguyen)",
        triagedAt: Date.now(),
      }),
    );
    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    // Triage fields reverted to pre-mutation state.
    expect(upsert.update.triagedAction).toBeNull();
    expect(upsert.update.status).toBe("AWAITING_TRIAGE");
    expect(upsert.update.triagedAt).toBeNull();
    // Gate preserved; approval audit NOT written; blocked audit written.
    expect(upsert.update.approvalGateUserId).toBe("u-gc");
    const approved = logAuditMock.mock.calls.filter(
      (c) => c[0]?.action === "intake.recommendation.approved",
    );
    expect(approved).toHaveLength(0);
    const blocked = logAuditMock.mock.calls.filter(
      (c) => c[0]?.action === "intake.recommendation.approval_blocked",
    );
    expect(blocked).toHaveLength(1);
    expect(blocked[0][0]).toMatchObject({
      actorId: "u-alex",
      afterJson: { attemptedAction: "approved", requiredApproverId: "u-gc" },
    });
  });

  it("lets the gate user approve normally", async () => {
    // Gate says u-alex — the session actor.
    intakeTicketFindUniqueMock.mockResolvedValue({
      status: "AWAITING_TRIAGE",
      stage: "assigned",
      triagedAction: null,
      triagedBy: null,
      triagedAt: null,
      assignedToUserId: null,
      firedRulesJson: null,
      approvalGateUserId: "u-alex",
    });
    routingRuleFindManyMock.mockResolvedValue([]);
    await intakeStorageSet(
      "aegis:tickets:v1",
      ticketsPayload({
        status: "Approved",
        triagedAction: "approved",
        triagedAt: Date.now(),
      }),
    );
    const upsert = intakeTicketUpsertMock.mock.calls[0][0];
    expect(upsert.update.triagedAction).toBe("approved");
    expect(upsert.update.status).toBe("APPROVED");
    expect(
      logAuditMock.mock.calls.filter(
        (c) => c[0]?.action === "intake.recommendation.approval_blocked",
      ),
    ).toHaveLength(0);
  });
});
