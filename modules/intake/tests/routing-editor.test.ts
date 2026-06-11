/**
 * P2a editor — create / update / delete service functions.
 *
 * Pure-server tests over the routing-rule editor service:
 *   - validation: name + at least one condition + at least one action
 *   - merge semantics: undefined preserves, null clears
 *   - audit emission: create / update / delete fire chain-sealed
 *     rows attributed to the session user with diff-style payloads.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ruleFindFirstMock = vi.fn();
const ruleCreateMock = vi.fn();
const ruleUpdateMock = vi.fn();
const ruleDeleteMock = vi.fn();
const logAuditMock = vi.fn();
const getCurrentUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeRoutingRule: {
      findFirst: ruleFindFirstMock,
      create: ruleCreateMock,
      update: ruleUpdateMock,
      delete: ruleDeleteMock,
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  logAudit: logAuditMock,
  getCurrentUser: getCurrentUserMock,
}));

const {
  createRoutingRule,
  updateRoutingRule,
  deleteRoutingRule,
  RoutingRuleNotFoundError,
  RoutingRuleValidationError,
} = await import("../src/routing/server");

const ACTOR = { id: "u-alex", organizationId: "org1", name: "Alex" };

const makeRow = (overrides = {}) => ({
  id: "r-1",
  name: "Existing",
  description: null,
  enabled: true,
  evalOrder: 50,
  matchType: "NDA Request",
  matchPriority: null,
  matchDepartment: null,
  matchKeyword: null,
  setAssigneeUserId: null,
  setPriority: null,
  setSlaHours: 8,
  timesFired: 7,
  lastFiredAt: null,
  assignee: null,
  ...overrides,
});

beforeEach(() => {
  ruleFindFirstMock.mockReset();
  ruleCreateMock.mockReset();
  ruleUpdateMock.mockReset();
  ruleDeleteMock.mockReset().mockResolvedValue(undefined);
  logAuditMock.mockReset().mockResolvedValue(undefined);
  getCurrentUserMock.mockReset().mockResolvedValue(ACTOR);
});

describe("createRoutingRule()", () => {
  it("creates a valid rule and writes the intake.routing_rule.created audit", async () => {
    const created = makeRow({ id: "r-new", name: "EU privacy → privacy team" });
    ruleCreateMock.mockResolvedValue(created);

    const dto = await createRoutingRule(
      "org1",
      {
        name: "EU privacy → privacy team",
        matchType: "Privacy Question",
        matchKeyword: "GDPR",
        setSlaHours: 12,
        evalOrder: 25,
      },
      undefined,
    );

    expect(dto.name).toBe("EU privacy → privacy team");
    expect(ruleCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org1",
          name: "EU privacy → privacy team",
          matchType: "Privacy Question",
          matchKeyword: "GDPR",
          setSlaHours: 12,
        }),
      }),
    );
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "intake.routing_rule.created",
        actorId: "u-alex",
        actorType: "USER",
        resourceId: "r-new",
      }),
    );
  });

  it("rejects a rule with no conditions (would match everything)", async () => {
    await expect(
      createRoutingRule(
        "org1",
        { name: "Bad", setSlaHours: 4 },
        undefined,
      ),
    ).rejects.toBeInstanceOf(RoutingRuleValidationError);
    expect(ruleCreateMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("rejects a rule with no actions (would be a no-op)", async () => {
    await expect(
      createRoutingRule(
        "org1",
        { name: "Bad", matchType: "NDA Request" },
        undefined,
      ),
    ).rejects.toBeInstanceOf(RoutingRuleValidationError);
    expect(ruleCreateMock).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace name", async () => {
    await expect(
      createRoutingRule(
        "org1",
        { name: "   ", matchType: "NDA Request", setSlaHours: 4 },
        undefined,
      ),
    ).rejects.toBeInstanceOf(RoutingRuleValidationError);
  });
});

describe("updateRoutingRule()", () => {
  it("merges partial input — undefined preserves, null clears", async () => {
    // Start with two conditions so we can clear one and the rule
    // stays valid (one condition + one action minimum).
    ruleFindFirstMock.mockResolvedValue(
      makeRow({ matchType: "NDA Request", matchKeyword: "renewal" }),
    );
    ruleUpdateMock.mockResolvedValue(
      makeRow({ matchType: null, matchKeyword: "renewal", setSlaHours: 4 }),
    );

    await updateRoutingRule(
      "org1",
      "r-1",
      { matchType: null, setSlaHours: 4 },
      undefined,
    );

    expect(ruleUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r-1" },
        data: expect.objectContaining({
          matchType: null, // cleared
          setSlaHours: 4, // updated
        }),
      }),
    );
    // Untouched fields are NOT in the patch (preservation, not overwrite).
    const data = ruleUpdateMock.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("evalOrder");
    expect(data).not.toHaveProperty("matchKeyword");
  });

  it("rejects when the merged shape becomes invalid (clearing the last condition)", async () => {
    ruleFindFirstMock.mockResolvedValue(makeRow()); // only matchType is set
    await expect(
      updateRoutingRule(
        "org1",
        "r-1",
        { matchType: null }, // clears the only condition
        undefined,
      ),
    ).rejects.toBeInstanceOf(RoutingRuleValidationError);
    expect(ruleUpdateMock).not.toHaveBeenCalled();
  });

  it("throws NotFound for an unknown id (or wrong org)", async () => {
    ruleFindFirstMock.mockResolvedValue(null);
    await expect(
      updateRoutingRule("org1", "r-missing", { name: "x" }, undefined),
    ).rejects.toBeInstanceOf(RoutingRuleNotFoundError);
  });

  it("writes a chain-sealed audit row with full before/after diff", async () => {
    ruleFindFirstMock.mockResolvedValue(makeRow());
    ruleUpdateMock.mockResolvedValue(makeRow({ setSlaHours: 4 }));
    await updateRoutingRule(
      "org1",
      "r-1",
      { setSlaHours: 4 },
      undefined,
    );
    const audit = logAuditMock.mock.calls[0][0];
    expect(audit.action).toBe("intake.routing_rule.updated");
    expect(audit.beforeJson.actions.setSlaHours).toBe(8);
    expect(audit.afterJson.actions.setSlaHours).toBe(4);
  });
});

describe("deleteRoutingRule()", () => {
  it("deletes and writes audit with the deleted rule preserved in beforeJson", async () => {
    ruleFindFirstMock.mockResolvedValue(makeRow({ name: "To remove" }));
    await deleteRoutingRule("org1", "r-1", undefined);

    expect(ruleDeleteMock).toHaveBeenCalledWith({ where: { id: "r-1" } });
    const audit = logAuditMock.mock.calls[0][0];
    expect(audit.action).toBe("intake.routing_rule.deleted");
    expect(audit.actorId).toBe("u-alex");
    expect(audit.beforeJson.name).toBe("To remove");
  });

  it("throws NotFound for an unknown id", async () => {
    ruleFindFirstMock.mockResolvedValue(null);
    await expect(
      deleteRoutingRule("org1", "r-missing", undefined),
    ).rejects.toBeInstanceOf(RoutingRuleNotFoundError);
    expect(ruleDeleteMock).not.toHaveBeenCalled();
  });
});
