/**
 * W2-5 (escalation rule actions, issue #112) — pure engine semantics
 * for `escalateTo` and `requireApprovalFrom`.
 */
import { describe, expect, it } from "vitest";
import { evaluateRoutingRules } from "../src/routing/rules";
import type { RoutingRuleLike } from "../src/routing/rules";

const BASE: RoutingRuleLike = {
  id: "r1",
  name: "rule",
  enabled: true,
  evalOrder: 10,
  matchType: null,
  matchPriority: null,
  matchDepartment: null,
  matchKeyword: null,
  setAssigneeUserId: null,
  setPriority: null,
  setSlaHours: null,
};

const TICKET = {
  type: "Litigation Notice",
  priority: "Medium",
  department: "Sales",
  description: "We have been served with a summons",
  slaHours: 24,
  assignedToUserId: null,
};

describe("escalateTo action", () => {
  const rule: RoutingRuleLike = {
    ...BASE,
    name: "Litigation → GC",
    matchType: "Litigation Notice",
    escalateToUserId: "u-gc",
    escalateToName: "Mark Williams",
  };

  it("assigns the target, raises priority to Critical, flags escalated", () => {
    const { patch, fired } = evaluateRoutingRules([rule], TICKET);
    expect(patch).toMatchObject({
      assignedToUserId: "u-gc",
      assignedTo: "Mark Williams",
      priority: "Critical",
      escalated: true,
    });
    expect(fired).toHaveLength(1);
    expect(fired[0]?.actions).toContain("escalate → Mark Williams");
  });

  it("is idempotent: once escalated state is in place it stops firing", () => {
    const { patch, fired } = evaluateRoutingRules([rule], {
      ...TICKET,
      priority: "Critical",
      assignedToUserId: "u-gc",
    });
    expect(fired).toHaveLength(0);
    expect(patch.escalated).toBeUndefined();
  });

  it("lets an explicit setPriority on the same rule win over Critical", () => {
    const { patch } = evaluateRoutingRules(
      [{ ...rule, setPriority: "High" }],
      TICKET,
    );
    expect(patch.priority).toBe("High");
    expect(patch.escalated).toBe(true);
  });

  it("lets a direct assignee on the same rule win the assignment", () => {
    const { patch } = evaluateRoutingRules(
      [{ ...rule, setAssigneeUserId: "u-direct", assigneeName: "Dee Rect" }],
      TICKET,
    );
    expect(patch.assignedToUserId).toBe("u-direct");
    expect(patch.escalated).toBe(true);
  });
});

describe("requireApprovalFrom action", () => {
  const rule: RoutingRuleLike = {
    ...BASE,
    name: "M&A drafts need GC sign-off",
    matchKeyword: "acquisition",
    requireApprovalFromUserId: "u-gc",
    approverName: "Mark Williams",
  };
  const ticket = { ...TICKET, description: "Acquisition NDA for Project Zephyr" };

  it("stamps the approval gate and describes the action", () => {
    const { patch, fired } = evaluateRoutingRules([rule], ticket);
    expect(patch.approvalGateUserId).toBe("u-gc");
    expect(fired[0]?.actions).toContain("approval gate → Mark Williams");
  });

  it("does not re-fire when the gate is already stamped", () => {
    const { fired } = evaluateRoutingRules([rule], {
      ...ticket,
      approvalGateUserId: "u-gc",
    });
    expect(fired).toHaveLength(0);
  });

  it("a gate-only rule counts as having an action (fires once)", () => {
    const { patch, fired } = evaluateRoutingRules([rule], ticket);
    expect(fired).toHaveLength(1);
    // Gate rules change nothing else about the ticket.
    expect(patch.priority).toBeUndefined();
    expect(patch.assignedToUserId).toBeUndefined();
  });
});
