import { describe, it, expect } from "vitest";
import {
  runEvalSuite,
  runEvalSuiteAsync,
  exactScore,
  setScore,
  labelScore,
  assertEvalThreshold,
  formatEvalReport,
} from "../src/eval.js";

describe("runEvalSuite (EVAL2) — general harness", () => {
  it("scores exact-match cases and reports pass rate + failures", () => {
    const cases = [
      { name: "a", input: 1, expected: "x" },
      { name: "b", input: 2, expected: "y" },
      { name: "c", input: 3, expected: "z" },
    ];
    const r = runEvalSuite(cases, (c) => (c.input === 3 ? "WRONG" : c.expected), exactScore);
    expect(r.total).toBe(3);
    expect(r.passed).toBe(2);
    expect(r.passRate).toBeCloseTo(2 / 3);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].name).toBe("c");
  });

  it("captures a thrown runFn as a failed case, not a crash", () => {
    const r = runEvalSuite([{ name: "boom", expected: 1 }], () => { throw new Error("kaboom"); }, exactScore);
    expect(r.passed).toBe(0);
    expect(r.failures[0].error).toContain("kaboom");
    expect(r.failures[0].detail).toContain("threw");
  });

  it("empty suite is vacuously green", () => {
    const r = runEvalSuite([], () => 1, exactScore);
    expect(r.passRate).toBe(1);
    expect(r.meanScore).toBe(1);
  });

  it("async variant awaits runFn", async () => {
    const r = await runEvalSuiteAsync(
      [{ name: "a", expected: "ok" }],
      async () => { await Promise.resolve(); return "ok"; },
      exactScore,
    );
    expect(r.passed).toBe(1);
  });
});

describe("setScore — recall / precision / F1", () => {
  it("full recall passes by default even with extra items", () => {
    const s = setScore(["A", "B"], ["A", "B", "C"]);
    expect(s.recall).toBe(1);
    expect(s.pass).toBe(true); // recall-only by default
    expect(s.precision).toBeCloseTo(2 / 3);
  });
  it("missing an expected item fails and names it", () => {
    const s = setScore(["A", "B"], ["A"]);
    expect(s.recall).toBe(0.5);
    expect(s.pass).toBe(false);
    expect(s.detail).toContain("missing=[B]");
  });
  it("requirePrecision uses F1 and demands no extras", () => {
    const s = setScore(["A", "B"], ["A", "B", "C"], { requirePrecision: true });
    expect(s.pass).toBe(false); // precision < 1
    expect(s.f1).toBeCloseTo((2 * (2 / 3) * 1) / (2 / 3 + 1));
    expect(s.score).toBe(s.f1);
  });
  it("supports a key extractor over objects", () => {
    const s = setScore([{ t: "A" }], [{ t: "A" }], { key: (x) => x.t });
    expect(s.pass).toBe(true);
  });
});

describe("labelScore — ordinal with adjacency tolerance", () => {
  const order = ["LOW", "MEDIUM", "HIGH"];
  it("exact label passes", () => {
    expect(labelScore("HIGH", "HIGH").pass).toBe(true);
  });
  it("adjacent band is partial credit, not a pass", () => {
    const s = labelScore("HIGH", "MEDIUM", { order, tolerance: 1 });
    expect(s.pass).toBe(false);
    expect(s.score).toBe(0.5);
  });
  it("two bands off is zero", () => {
    expect(labelScore("HIGH", "LOW", { order, tolerance: 1 }).score).toBe(0);
  });
});

describe("assertEvalThreshold", () => {
  const green = runEvalSuite([{ name: "a", expected: 1 }], () => 1, exactScore);
  const red = runEvalSuite([{ name: "a", expected: 1 }, { name: "b", expected: 2 }], () => 1, exactScore);
  it("passes when the bar is met", () => {
    expect(() => assertEvalThreshold(green, { minPassRate: 1 })).not.toThrow();
  });
  it("throws a readable error listing failures when below bar", () => {
    expect(() => assertEvalThreshold(red, { minPassRate: 1, label: "demo" })).toThrow(/demo: passRate 0\.500/);
  });
  it("respects minMeanScore independently", () => {
    expect(() => assertEvalThreshold(red, { minPassRate: 0, minMeanScore: 0.9 })).toThrow(/meanScore/);
  });
});

describe("formatEvalReport", () => {
  it("renders a header + one line per case", () => {
    const r = runEvalSuite([{ name: "a", expected: 1 }, { name: "b", expected: 2 }], (c) => c.expected, exactScore);
    const txt = formatEvalReport(r, "MySuite");
    expect(txt).toContain("MySuite: 2/2 passed");
    expect(txt.split("\n")).toHaveLength(3);
  });
});
