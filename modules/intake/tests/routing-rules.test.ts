/**
 * P2a (demo-lite) — routing-rule evaluation semantics.
 *
 * Pure-function tests over evaluateRoutingRules: condition matching,
 * AND semantics, evalOrder chaining (later rules see earlier rules'
 * effects), no-op-match-isn't-a-firing, and disabled-rule skipping.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateRoutingRules,
  type RoutingRuleLike,
} from "../src/routing/rules";

function rule(partial: Partial<RoutingRuleLike> & { id: string }): RoutingRuleLike {
  return {
    name: partial.id,
    enabled: true,
    evalOrder: 100,
    matchType: null,
    matchPriority: null,
    matchDepartment: null,
    matchKeyword: null,
    setAssigneeUserId: null,
    setPriority: null,
    setSlaHours: null,
    ...partial,
  };
}

const NDA_SLA = rule({
  id: "r-nda",
  name: "NDA fast lane",
  matchType: "NDA Request",
  setSlaHours: 8,
});
const BREACH_CRITICAL = rule({
  id: "r-breach",
  name: "Breach keywords",
  evalOrder: 5,
  matchKeyword: "breach",
  setPriority: "Critical",
});
const CRITICAL_GC = rule({
  id: "r-gc",
  name: "Critical → GC",
  evalOrder: 10,
  matchPriority: "Critical",
  setAssigneeUserId: "u-gc",
  assigneeName: "Marcus Reyes",
  setSlaHours: 4,
});

describe("evaluateRoutingRules()", () => {
  it("applies a matching rule's actions and reports the firing", () => {
    const { patch, fired } = evaluateRoutingRules([NDA_SLA], {
      type: "NDA Request",
      priority: "Low",
      slaHours: 24,
    });
    expect(patch).toEqual({ slaHours: 8 });
    expect(fired).toEqual([
      { id: "r-nda", name: "NDA fast lane", actions: ["SLA → 8h"] },
    ]);
  });

  it("does not fire on a non-matching ticket", () => {
    const { patch, fired } = evaluateRoutingRules([NDA_SLA], {
      type: "Contract Question",
      slaHours: 24,
    });
    expect(patch).toEqual({});
    expect(fired).toEqual([]);
  });

  it("ANDs all non-null conditions", () => {
    const r = rule({
      id: "r-and",
      matchType: "NDA Request",
      matchDepartment: "Sales",
      setSlaHours: 8,
    });
    const miss = evaluateRoutingRules([r], {
      type: "NDA Request",
      department: "Finance",
      slaHours: 24,
    });
    expect(miss.fired).toEqual([]);
    const hit = evaluateRoutingRules([r], {
      type: "NDA Request",
      department: "Sales",
      slaHours: 24,
    });
    expect(hit.fired).toHaveLength(1);
  });

  it("matches keywords case-insensitively as substrings", () => {
    const { fired } = evaluateRoutingRules([BREACH_CRITICAL], {
      description: "Possible data BREACH reported by vendor",
      priority: "Medium",
    });
    expect(fired).toHaveLength(1);
  });

  it("chains: an earlier rule's priority change triggers a later matchPriority rule", () => {
    const { patch, fired } = evaluateRoutingRules(
      [CRITICAL_GC, BREACH_CRITICAL], // order in array irrelevant — evalOrder wins
      {
        description: "We may have a security breach in the EU region",
        priority: "Medium",
        slaHours: 24,
      },
    );
    expect(fired.map((f) => f.id)).toEqual(["r-breach", "r-gc"]);
    expect(patch).toEqual({
      priority: "Critical",
      assignedToUserId: "u-gc",
      assignedTo: "Marcus Reyes",
      slaHours: 4,
    });
  });

  it("a matching rule whose actions change nothing does not count as a firing", () => {
    const { fired } = evaluateRoutingRules([NDA_SLA], {
      type: "NDA Request",
      slaHours: 8, // already at the rule's target
    });
    expect(fired).toEqual([]);
  });

  it("skips disabled rules", () => {
    const { fired } = evaluateRoutingRules(
      [{ ...NDA_SLA, enabled: false }],
      { type: "NDA Request", slaHours: 24 },
    );
    expect(fired).toEqual([]);
  });

  it("does not reassign when the ticket already has the target assignee", () => {
    const { patch, fired } = evaluateRoutingRules([CRITICAL_GC], {
      priority: "Critical",
      assignedToUserId: "u-gc",
      slaHours: 24,
    });
    // SLA still tightens, but no assignee churn.
    expect(patch).toEqual({ slaHours: 4 });
    expect(fired[0].actions).toEqual(["SLA → 4h"]);
  });
});
