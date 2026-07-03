/** W2-1 unit: complexity derivation + matchComplexity in the engine. */
import { describe, expect, it } from "vitest";
import { deriveComplexity, isComplexityBand } from "../src/routing/complexity";
import { evaluateRoutingRules } from "../src/routing/rules";

describe("W2-1 deriveComplexity", () => {
  it("scores high-risk or heavy-effort work complex", () => {
    expect(deriveComplexity({ riskFlag: "High — Board-level exposure", confidence: 93, estimatedHours: 10 })).toBe("complex");
    expect(deriveComplexity({ riskFlag: "Critical — sanctions", confidence: 99, estimatedHours: 12 })).toBe("complex");
    expect(deriveComplexity({ riskFlag: "Medium — DPIA may be required", confidence: 89, estimatedHours: 9 })).toBe("complex"); // hours alone
  });
  it("scores template-fit low-risk work simple", () => {
    expect(deriveComplexity({ riskFlag: "None — Auto-draft from playbook", confidence: 96, estimatedHours: 0 })).toBe("simple");
    expect(deriveComplexity({ riskFlag: "Low — Routine IP clearance", confidence: 91, estimatedHours: 2 })).toBe("simple");
  });
  it("everything else — and missing triage — is standard", () => {
    expect(deriveComplexity({ riskFlag: "Medium — check", confidence: 89, estimatedHours: 5 })).toBe("standard");
    expect(deriveComplexity({ riskFlag: "Low — fine", confidence: 70, estimatedHours: 1 })).toBe("standard"); // low confidence
    expect(deriveComplexity(null)).toBe("standard");
  });
  it("band guard", () => {
    expect(isComplexityBand("complex")).toBe(true);
    expect(isComplexityBand("hard")).toBe(false);
  });
});

describe("W2-1 matchComplexity in the rule engine", () => {
  const rule = (over: Record<string, unknown>) => ({
    id: "r1", name: "Complex → senior", enabled: true, evalOrder: 10,
    matchType: null, matchPriority: null, matchDepartment: null, matchKeyword: null,
    setAssigneeUserId: null, setPriority: null, setSlaHours: null,
    ...over,
  });
  it("fires only on the matching band", () => {
    const rules = [rule({ matchComplexity: "complex", setPriority: "Critical" })];
    const hit = evaluateRoutingRules(rules as never, { description: "demand letter", complexity: "complex" });
    expect(hit.fired).toHaveLength(1);
    expect(hit.patch.priority).toBe("Critical");
    const miss = evaluateRoutingRules(rules as never, { description: "simple nda", complexity: "simple" });
    expect(miss.fired).toHaveLength(0);
  });
  it("missing complexity defaults to standard", () => {
    const rules = [rule({ matchComplexity: "standard", setSlaHours: 12 })];
    const r = evaluateRoutingRules(rules as never, { description: "x" });
    expect(r.fired).toHaveLength(1);
    expect(r.patch.slaHours).toBe(12);
  });
});
