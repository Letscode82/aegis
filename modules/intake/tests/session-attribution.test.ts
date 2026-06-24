/**
 * Phase 1a — session-resolved attribution in the intake storage path.
 *
 * Three behaviors under test:
 *   1. Triage transitions overwrite `triagedBy` with the session
 *      user's name regardless of what the client sent. No client-side
 *      spoofing path; matches the audit row's `actorId`.
 *   2. Brand-new ticket requester resolution prefers the session
 *      user's Person row (`Person.userId === User.id`), then name
 *      match, then auto-create as last resort.
 *   3. Agent activity log resolves real actor display names from the
 *      User table — no hardcoded "Alex Nguyen" fallback.
 *
 * Prisma is mocked at the module boundary; the tests drive the public
 * `intakeStorageSet` / `intakeStorageGet` surface so the integration
 * between the resolver, the upsert, and the audit log is exercised
 * end-to-end against controlled inputs.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const personFindFirstMock = vi.fn();
const personUpsertMock = vi.fn();
const intakeTicketFindUniqueMock = vi.fn();
const intakeTicketUpsertMock = vi.fn();
const intakeTicketFindManyMock = vi.fn();
const auditLogFindManyMock = vi.fn();
const userFindManyMock = vi.fn();
const agentRecDeleteMock = vi.fn();
const agentRecCreateMock = vi.fn();
const conversationDeleteMock = vi.fn();
const conversationCreateMock = vi.fn();
const conversationFindManyMock = vi.fn();

const logAuditMock = vi.fn();
const getCurrentOrganizationMock = vi.fn();
const getCurrentUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    person: {
      findFirst: personFindFirstMock,
      upsert: personUpsertMock,
    },
    intakeTicket: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: intakeTicketFindUniqueMock,
      upsert: intakeTicketUpsertMock,
      findMany: intakeTicketFindManyMock,
    },
    auditLog: { findMany: auditLogFindManyMock },
    user: { findMany: userFindManyMock },
    agentRecommendation: {
      deleteMany: agentRecDeleteMock,
      create: agentRecCreateMock,
    },
    intakeConversation: {
      deleteMany: conversationDeleteMock,
      create: conversationCreateMock,
      findMany: conversationFindManyMock,
    },
    userPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    // P2a — routing rules load inside the save chokepoint; default to
    // none so legacy behavior assertions hold.
    agentDecision: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "ad-1", approvalStatus: "PENDING" }), update: vi.fn().mockResolvedValue({ id: "ad-1", approvalStatus: "APPROVED" }) },
    intakeRoutingRule: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
    },
  },
  logAudit: logAuditMock,
  getCurrentOrganization: getCurrentOrganizationMock,
  getCurrentUser: getCurrentUserMock,
  IntakeSource: {
    FORM: "FORM",
    EMAIL: "EMAIL",
    SLACK: "SLACK",
    API: "API",
    COPILOT: "COPILOT",
  },
  IntakeStatus: {
    AWAITING_TRIAGE: "AWAITING_TRIAGE",
    IN_REVIEW: "IN_REVIEW",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    ESCALATED: "ESCALATED",
    CLOSED: "CLOSED",
  },
  AgentRecommendationStatus: {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
  },
  ConversationRole: {
    USER: "USER",
    ASSISTANT: "ASSISTANT",
    SYSTEM: "SYSTEM",
  },
  MatterType: {
    LITIGATION: "LITIGATION",
    TRANSACTIONAL: "TRANSACTIONAL",
    MA: "MA",
    IP: "IP",
    EMPLOYMENT: "EMPLOYMENT",
    REGULATORY: "REGULATORY",
    INVESTIGATION: "INVESTIGATION",
    ADVISORY: "ADVISORY",
    OTHER: "OTHER",
  },
}));
vi.mock("@aegis/matter", () => ({
  createMatter: vi.fn().mockResolvedValue({ id: "m-test", matterNumber: "M-2026-TEST" }),
}));

const { intakeStorageSet, intakeStorageGet } = await import(
  "../src/storage/server"
);

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
  intakeTicketFindManyMock.mockReset();
  auditLogFindManyMock.mockReset();
  userFindManyMock.mockReset();
  agentRecDeleteMock.mockReset();
  agentRecCreateMock.mockReset();
  conversationDeleteMock.mockReset();
  conversationCreateMock.mockReset();
  conversationFindManyMock.mockReset();
  logAuditMock.mockReset();
  getCurrentOrganizationMock.mockReset();
  getCurrentUserMock.mockReset();

  // Default mock behavior.
  getCurrentOrganizationMock.mockResolvedValue({ id: "org1" });
  getCurrentUserMock.mockResolvedValue(SESSION_USER);
  intakeTicketUpsertMock.mockResolvedValue({ id: "REQ-1" });
  logAuditMock.mockResolvedValue(undefined);
});

// ── Triage attribution (server-authoritative) ────────────────────────

describe("saveTicketsV8 — triagedBy is server-authoritative", () => {
  it("overwrites client-supplied triagedBy on a new triage transition", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "IN_REVIEW",
      triagedAction: null,
      triagedBy: null,
    });
    // No requester-lookup hits needed for this test — the ticket
    // pre-exists so `before` is non-null; the requester logic only
    // runs for brand-new tickets.
    personFindFirstMock.mockResolvedValue(null);
    personUpsertMock.mockResolvedValue({ id: "p-fallback" });

    const ticket = {
      id: "REQ-1",
      from: "Rachel Adams",
      dept: "Legal",
      type: "NDA",
      priority: "High",
      status: "In Review",
      stage: "triage",
      desc: "Vendor NDA",
      triagedAction: "approved",
      triagedAt: Date.now(),
      // Client-supplied — should be ignored. Server overwrites.
      triagedBy: "Hacker McSpoof",
    };

    await intakeStorageSet("aegis:tickets:v1", JSON.stringify([ticket]));

    const upsertCall = intakeTicketUpsertMock.mock.calls[0]?.[0];
    expect(upsertCall.update.triagedBy).toBe("Rachel Adams");
    expect(upsertCall.update.triagedBy).not.toBe("Hacker McSpoof");
  });

  it("preserves prior triagedBy when triage action is unchanged", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "APPROVED",
      triagedAction: "approved",
      triagedBy: "Marcus Reid", // prior triager — must survive
    });
    personFindFirstMock.mockResolvedValue(null);
    personUpsertMock.mockResolvedValue({ id: "p-fallback" });

    const ticket = {
      id: "REQ-1",
      type: "NDA",
      from: "Alex",
      triagedAction: "approved", // unchanged
      triagedBy: "spoof", // ignored
    };

    await intakeStorageSet("aegis:tickets:v1", JSON.stringify([ticket]));

    const upsertCall = intakeTicketUpsertMock.mock.calls[0]?.[0];
    expect(upsertCall.update.triagedBy).toBe("Marcus Reid");
  });

  it("leaves triagedBy null when no triage action is set and none was prior", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce({
      status: "AWAITING_TRIAGE",
      triagedAction: null,
      triagedBy: null,
    });
    personFindFirstMock.mockResolvedValue(null);
    personUpsertMock.mockResolvedValue({ id: "p-fallback" });

    const ticket = {
      id: "REQ-1",
      type: "NDA",
      from: "Alex",
      // no triagedAction
    };

    await intakeStorageSet("aegis:tickets:v1", JSON.stringify([ticket]));

    const upsertCall = intakeTicketUpsertMock.mock.calls[0]?.[0];
    expect(upsertCall.update.triagedBy).toBeNull();
  });
});

// ── Requester resolution (session-first) ─────────────────────────────

describe("saveTicketsV8 — requester resolution prefers Person.userId", () => {
  it("uses the session user's Person row when one exists", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce(null); // brand-new
    personFindFirstMock.mockResolvedValueOnce({ id: "p-rachel" }); // userId hit

    const ticket = {
      id: "REQ-NEW",
      from: "Some Other Name", // intentionally mismatching session
      dept: "Legal",
      type: "NDA",
      submittedTs: Date.now(),
    };

    await intakeStorageSet("aegis:tickets:v1", JSON.stringify([ticket]));

    // First findFirst call asks for the session user's Person via userId.
    const firstCall = personFindFirstMock.mock.calls[0]?.[0];
    expect(firstCall.where.userId).toBe("u-rachel");
    expect(firstCall.where.organizationId).toBe("org1");

    const upsertCall = intakeTicketUpsertMock.mock.calls[0]?.[0];
    expect(upsertCall.create.requesterId).toBe("p-rachel");
    expect(personUpsertMock).not.toHaveBeenCalled();
  });

  it("falls back to name match when no Person.userId is linked", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce(null);
    personFindFirstMock
      .mockResolvedValueOnce(null) // userId miss
      .mockResolvedValueOnce({ id: "p-by-name" }); // name hit

    const ticket = {
      id: "REQ-NEW",
      from: "Alex Nguyen",
      type: "NDA",
      submittedTs: Date.now(),
    };

    await intakeStorageSet("aegis:tickets:v1", JSON.stringify([ticket]));

    expect(personFindFirstMock).toHaveBeenCalledTimes(2);
    const secondCall = personFindFirstMock.mock.calls[1]?.[0];
    expect(secondCall.where.name).toBe("Alex Nguyen");

    const upsertCall = intakeTicketUpsertMock.mock.calls[0]?.[0];
    expect(upsertCall.create.requesterId).toBe("p-by-name");
    expect(personUpsertMock).not.toHaveBeenCalled();
  });

  it("auto-creates a Person when neither lookup matches", async () => {
    intakeTicketFindUniqueMock.mockResolvedValueOnce(null);
    personFindFirstMock.mockResolvedValue(null); // both lookups miss
    personUpsertMock.mockResolvedValueOnce({ id: "p-auto-jane-smith" });

    const ticket = {
      id: "REQ-NEW",
      from: "Jane Smith",
      type: "NDA",
      submittedTs: Date.now(),
    };

    await intakeStorageSet("aegis:tickets:v1", JSON.stringify([ticket]));

    expect(personUpsertMock).toHaveBeenCalledTimes(1);
    const upsertCall = intakeTicketUpsertMock.mock.calls[0]?.[0];
    expect(upsertCall.create.requesterId).toBe("p-auto-jane-smith");
  });
});

// ── Agent activity log (real actor names) ────────────────────────────

describe("loadAgentLogV8 — actor name resolution", () => {
  it("resolves USER actorIds to the real User.name", async () => {
    auditLogFindManyMock.mockResolvedValueOnce([
      {
        action: "intake.recommendation.approved",
        resourceType: "IntakeTicket",
        resourceId: "REQ-1",
        actorId: "u-rachel",
        actorType: "USER",
        timestamp: new Date(),
        metadata: null,
      },
    ]);
    userFindManyMock.mockResolvedValueOnce([
      { id: "u-rachel", name: "Rachel Adams" },
    ]);

    const result = await intakeStorageGet("aegis:intake:agent-log:v1");
    expect(result).not.toBeNull();
    const entries = JSON.parse(result!.value) as Array<{ attorney: string }>;
    expect(entries[0].attorney).toBe("Rachel Adams");
    expect(entries[0].attorney).not.toMatch(/Alex Nguyen/);
  });

  it("labels AGENT and SYSTEM actors without a DB hit", async () => {
    auditLogFindManyMock.mockResolvedValueOnce([
      {
        action: "intake.ticket.created",
        resourceType: "IntakeTicket",
        resourceId: "REQ-1",
        actorId: null,
        actorType: "AGENT",
        timestamp: new Date(),
        metadata: null,
      },
      {
        action: "intake.ticket.created",
        resourceType: "IntakeTicket",
        resourceId: "REQ-2",
        actorId: null,
        actorType: "SYSTEM",
        timestamp: new Date(),
        metadata: null,
      },
    ]);

    const result = await intakeStorageGet("aegis:intake:agent-log:v1");
    const entries = JSON.parse(result!.value) as Array<{ attorney: string }>;
    expect(entries[0].attorney).toBe("AEGIS Agent");
    expect(entries[1].attorney).toBe("System");
    // No USER rows, so no user lookup is fired.
    expect(userFindManyMock).not.toHaveBeenCalled();
  });

  it("falls back to 'Unknown user' when a USER actor's row is missing", async () => {
    auditLogFindManyMock.mockResolvedValueOnce([
      {
        action: "intake.ticket.created",
        resourceType: "IntakeTicket",
        resourceId: "REQ-1",
        actorId: "u-deleted",
        actorType: "USER",
        timestamp: new Date(),
        metadata: null,
      },
    ]);
    userFindManyMock.mockResolvedValueOnce([]); // row missing

    const result = await intakeStorageGet("aegis:intake:agent-log:v1");
    const entries = JSON.parse(result!.value) as Array<{ attorney: string }>;
    expect(entries[0].attorney).toBe("Unknown user");
  });

  it("returns [] without a user lookup when the audit log is empty", async () => {
    auditLogFindManyMock.mockResolvedValueOnce([]);
    const result = await intakeStorageGet("aegis:intake:agent-log:v1");
    expect(JSON.parse(result!.value)).toEqual([]);
    expect(userFindManyMock).not.toHaveBeenCalled();
  });
});

// ── Cockpit state — legacy "Alex Nguyen" migration ───────────────────

// `loadCockpitState` reads from the `./store` module's KV wrapper. We
// mock the wrapper here so the test drives it deterministically
// without standing up window.storage.

describe("loadCockpitState — legacy attorney string sunset", () => {
  const storeGetMock = vi.fn();
  const storeSetMock = vi.fn();

  beforeEach(() => {
    storeGetMock.mockReset();
    storeSetMock.mockReset();
    vi.resetModules();
    vi.doMock("../src/storage/store", () => ({
      storeGet: storeGetMock,
      storeSet: storeSetMock,
      storeDel: vi.fn(),
    }));
  });

  it("rewrites a persisted 'You (Alex Nguyen)' value to null on read", async () => {
    storeGetMock.mockResolvedValueOnce({
      lastPos: 0,
      attorney: "You (Alex Nguyen)",
      triagedToday: 3,
      triagedDate: new Date().toISOString().slice(0, 10),
    });
    const { loadCockpitState } = await import("../src/storage/cockpit-state");
    const s = await loadCockpitState();
    expect(s.attorney).toBeNull();
    // Non-attorney fields are preserved so the user doesn't lose their
    // daily triage counter on migration.
    expect(s.triagedToday).toBe(3);
  });

  it("preserves a custom persisted attorney string verbatim", async () => {
    storeGetMock.mockResolvedValueOnce({
      lastPos: 0,
      attorney: "Marcus Reid", // custom override the user explicitly set
      triagedToday: 0,
      triagedDate: new Date().toISOString().slice(0, 10),
    });
    const { loadCockpitState } = await import("../src/storage/cockpit-state");
    const s = await loadCockpitState();
    expect(s.attorney).toBe("Marcus Reid");
  });
});
