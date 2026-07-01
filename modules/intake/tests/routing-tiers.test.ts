/**
 * Item 5 (tiering) — route-to-pool wired through the pure routing
 * evaluator. Verifies the resolver is invoked for setTeamId rules, that
 * a direct assignee wins over a pool pick, and that the fired-rule
 * summary + patch carry the pool decision.
 */
import { describe, expect, it, vi } from "vitest";
import { evaluateRoutingRules } from "../src/routing/rules";
import type { RoutingRuleLike, ResolvedPoolPick } from "../src/routing/rules";

function rule(over: Partial<RoutingRuleLike>): RoutingRuleLike {
  return {
    id: "r1",
    name: "Rule 1",
    enabled: true,
    evalOrder: 100,
    matchType: null,
    matchPriority: null,
    matchDepartment: null,
    matchKeyword: null,
    setAssigneeUserId: null,
    setPriority: null,
    setSlaHours: null,
    setTeamId: null,
    assigneeName: null,
    teamName: null,
    ...over,
  };
}

const ticket = {
  type: "Contract Review",
  priority: "Medium",
  department: "Sales",
  description: "Review the MSA",
  slaHours: 24,
  assignedToUserId: null,
};

describe("evaluateRoutingRules — route-to-pool", () => {
  it("resolves a pool rule to a concrete member and records the pool", () => {
    const resolvePool = vi.fn(
      (teamId: string): ResolvedPoolPick => ({
        teamId,
        teamName: "Contracts",
        userId: "u-maria",
        userName: "Maria Chen",
        overflowPath: [],
      }),
    );
    const { patch, fired } = evaluateRoutingRules(
      [rule({ matchType: "Contract Review", setTeamId: "t-contracts", teamName: "Contracts" })],
      ticket,
      { resolvePool },
    );
    expect(resolvePool).toHaveBeenCalledWith("t-contracts");
    expect(patch.assignedToUserId).toBe("u-maria");
    expect(patch.assignedTo).toBe("Maria Chen");
    expect(patch.teamId).toBe("t-contracts");
    expect(patch.teamName).toBe("Contracts");
    expect(fired).toHaveLength(1);
    expect(fired[0].actions.join(" ")).toMatch(/pool Contracts → Maria Chen/);
  });

  it("marks overflow in the action summary", () => {
    const resolvePool = (teamId: string): ResolvedPoolPick => ({
      teamId: "t-junior",
      teamName: "Junior",
      userId: "u-jr",
      userName: "Jr Counsel",
      overflowPath: ["t-senior"],
    });
    const { fired } = evaluateRoutingRules(
      [rule({ matchType: "Contract Review", setTeamId: "t-senior" })],
      ticket,
      { resolvePool },
    );
    expect(fired[0].actions.join(" ")).toMatch(/pool Junior → Jr Counsel \(overflow\)/);
  });

  it("a direct assignee on the same rule wins over the pool", () => {
    const resolvePool = vi.fn();
    const { patch } = evaluateRoutingRules(
      [rule({ matchType: "Contract Review", setAssigneeUserId: "u-direct", assigneeName: "Direct Person", setTeamId: "t-contracts" })],
      ticket,
      { resolvePool },
    );
    expect(resolvePool).not.toHaveBeenCalled();
    expect(patch.assignedToUserId).toBe("u-direct");
    expect(patch.assignedTo).toBe("Direct Person");
    expect(patch.teamId).toBeUndefined();
  });

  it("does not fire when the pool has no available member (userId null)", () => {
    const resolvePool = (teamId: string): ResolvedPoolPick => ({
      teamId,
      teamName: "Contracts",
      userId: null,
      overflowPath: [],
    });
    const { patch, fired } = evaluateRoutingRules(
      [rule({ matchType: "Contract Review", setTeamId: "t-contracts" })],
      ticket,
      { resolvePool },
    );
    expect(fired).toHaveLength(0);
    expect(patch.assignedToUserId).toBeUndefined();
  });

  it("pool rules no-op when no resolver is supplied (DB-free context)", () => {
    const { patch, fired } = evaluateRoutingRules(
      [rule({ matchType: "Contract Review", setTeamId: "t-contracts" })],
      ticket,
    );
    expect(fired).toHaveLength(0);
    expect(patch.assignedToUserId).toBeUndefined();
  });

  it("still applies priority/SLA alongside a pool assignment", () => {
    const resolvePool = (teamId: string): ResolvedPoolPick => ({
      teamId,
      teamName: "Contracts",
      userId: "u-maria",
      userName: "Maria Chen",
      overflowPath: [],
    });
    const { patch } = evaluateRoutingRules(
      [rule({ matchType: "Contract Review", setTeamId: "t-contracts", setPriority: "High", setSlaHours: 8 })],
      ticket,
      { resolvePool },
    );
    expect(patch.priority).toBe("High");
    expect(patch.slaHours).toBe(8);
    expect(patch.assignedToUserId).toBe("u-maria");
  });
});
