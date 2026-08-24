import { describe, it, expect } from "vitest";
import {
  planSteps,
  critique,
  TOOL_META,
  type AutoPilotTool,
} from "../src/autopilot";

describe("TOOL_META kind classification", () => {
  it("marks evidence-touching tools mutating and analysis tools read", () => {
    expect(TOOL_META.cull.kind).toBe("mutating");
    expect(TOOL_META.ai_review.kind).toBe("mutating");
    expect(TOOL_META.eca.kind).toBe("read");
    expect(TOOL_META.case_graph.kind).toBe("read");
    expect(TOOL_META.assemble.kind).toBe("read");
  });
});

describe("planSteps", () => {
  it("plans the full pipeline for a fresh, uncoded collection", () => {
    const steps = planSteps({ itemCount: 40, excludedCount: 0, aiRoutedCount: 0 });
    expect(steps.map((s) => s.tool)).toEqual([
      "cull",
      "ai_review",
      "eca",
      "case_graph",
      "assemble",
    ]);
    // Always ends in assemble (the loop terminates on the report).
    expect(steps[steps.length - 1]!.tool).toBe("assemble");
  });

  it("skips cull when the set is already culled", () => {
    const steps = planSteps({ itemCount: 40, excludedCount: 5, aiRoutedCount: 0 });
    expect(steps.map((s) => s.tool)).not.toContain("cull");
    expect(steps.map((s) => s.tool)).toContain("ai_review");
  });

  it("skips ai_review when every item is already AI-routed", () => {
    const steps = planSteps({ itemCount: 40, excludedCount: 5, aiRoutedCount: 40 });
    expect(steps.map((s) => s.tool)).toEqual(["eca", "case_graph", "assemble"]);
  });

  it("skips cull for a tiny set (nothing to dedupe)", () => {
    const steps = planSteps({ itemCount: 2, excludedCount: 0, aiRoutedCount: 0 });
    expect(steps.map((s) => s.tool)).not.toContain("cull");
  });

  it("plans nothing for an empty collection", () => {
    expect(planSteps({ itemCount: 0, excludedCount: 0, aiRoutedCount: 0 })).toEqual([]);
  });

  it("labels each step from TOOL_META", () => {
    const steps = planSteps({ itemCount: 40, excludedCount: 0, aiRoutedCount: 0 });
    for (const s of steps) {
      expect(s.title).toBe(TOOL_META[s.tool as AutoPilotTool].title);
      expect(s.kind).toBe(TOOL_META[s.tool as AutoPilotTool].kind);
    }
  });
});

describe("critique (bounded loop)", () => {
  it("re-plans one broadened pass when review found nothing responsive", () => {
    const r = critique({ aiReviewRan: true, responsiveCount: 0, passCount: 1 });
    expect(r.append.map((s) => s.tool)).toEqual(["ai_review", "case_graph", "assemble"]);
  });

  it("converges when responsive documents were found", () => {
    const r = critique({ aiReviewRan: true, responsiveCount: 7, passCount: 1 });
    expect(r.append).toEqual([]);
  });

  it("stops at the pass cap even with zero responsive (guarantees termination)", () => {
    const r = critique({ aiReviewRan: true, responsiveCount: 0, passCount: 2 });
    expect(r.append).toEqual([]);
  });

  it("does not re-plan if review never ran", () => {
    const r = critique({ aiReviewRan: false, responsiveCount: 0, passCount: 1 });
    expect(r.append).toEqual([]);
  });
});
