import { describe, it, expect } from "vitest";
import { wilsonInterval, confusionMatrix, recallPrecision, overturnRate, stratifiedSample } from "../src/index";

const item = (p: boolean, a: boolean) => ({ predictedPositive: p, actualPositive: a });

describe("wilsonInterval", () => {
  it("brackets the point estimate and clamps to [0,1]", () => {
    const ci = wilsonInterval(8, 10);
    expect(ci.low).toBeGreaterThan(0);
    expect(ci.high).toBeLessThanOrEqual(1);
    expect(ci.low).toBeLessThan(0.8);
    expect(ci.high).toBeGreaterThan(0.8);
  });
  it("is [0,0] for n=0", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });
});

describe("confusionMatrix / recallPrecision", () => {
  const items = [
    item(true, true), item(true, true), item(true, true), // TP x3
    item(true, false), // FP
    item(false, true), // FN
    item(false, false), item(false, false), // TN x2
  ];
  it("counts the matrix", () => {
    expect(confusionMatrix(items)).toEqual({ tp: 3, fp: 1, fn: 1, tn: 2 });
  });
  it("computes recall, precision, F1 with CIs", () => {
    const m = recallPrecision(items);
    expect(m.recall).toBe(0.75); // 3 / (3+1)
    expect(m.precision).toBe(0.75); // 3 / (3+1)
    expect(m.f1).toBe(0.75);
    expect(m.recallCI).not.toBeNull();
    expect(m.precisionCI!.high).toBeLessThanOrEqual(1);
  });
  it("returns null metrics when denominators are zero", () => {
    const none = recallPrecision([item(false, false), item(false, false)]);
    expect(none.recall).toBeNull();
    expect(none.precision).toBeNull();
    expect(none.f1).toBeNull();
  });
});

describe("overturnRate", () => {
  it("counts disagreements between AI and human", () => {
    const r = overturnRate([item(true, true), item(true, false), item(false, true), item(false, false)]);
    expect(r).toEqual({ total: 4, overturned: 2, rate: 0.5 });
  });
  it("null rate for empty", () => {
    expect(overturnRate([]).rate).toBeNull();
  });
});

describe("stratifiedSample", () => {
  it("returns everything when sample >= population", () => {
    const items = [1, 2, 3];
    expect(stratifiedSample(items, () => "a", 10)).toEqual([1, 2, 3]);
  });
  it("draws proportionally across strata and never exceeds the cap", () => {
    const items = [
      ...Array.from({ length: 60 }, (_, i) => ({ s: "A", i })),
      ...Array.from({ length: 40 }, (_, i) => ({ s: "B", i })),
    ];
    const sample = stratifiedSample(items, (x) => x.s, 10);
    expect(sample.length).toBeLessThanOrEqual(10);
    const a = sample.filter((x) => x.s === "A").length;
    const b = sample.filter((x) => x.s === "B").length;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).toBeGreaterThanOrEqual(b); // A is the larger stratum
  });
  it("is deterministic", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(stratifiedSample(items, (x) => String(x % 2), 8)).toEqual(stratifiedSample(items, (x) => String(x % 2), 8));
  });
});
