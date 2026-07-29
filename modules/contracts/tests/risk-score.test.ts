import { describe, it, expect } from "vitest";
import { scoreContractClauses, bandForScore } from "../src/internal/risk-score";

const cl = (type: string, risk: "LOW" | "MEDIUM" | "HIGH", deviation = false) => ({ type, risk, deviation });

describe("bandForScore", () => {
  it("maps score to band, null → UNSCORED", () => {
    expect(bandForScore(null)).toBe("UNSCORED");
    expect(bandForScore(0)).toBe("LOW");
    expect(bandForScore(29)).toBe("LOW");
    expect(bandForScore(30)).toBe("MEDIUM");
    expect(bandForScore(59)).toBe("MEDIUM");
    expect(bandForScore(60)).toBe("HIGH");
    expect(bandForScore(100)).toBe("HIGH");
  });
});

describe("scoreContractClauses", () => {
  it("returns null / UNSCORED for an empty clause set (no misleading LOW)", () => {
    const r = scoreContractClauses([]);
    expect(r.score).toBeNull();
    expect(r.band).toBe("UNSCORED");
    expect(r.clauseCount).toBe(0);
    expect(r.drivers).toEqual([]);
  });

  it("scores an all-LOW non-deviating contract as low", () => {
    const r = scoreContractClauses([cl("PAYMENT", "LOW"), cl("GOVERNING_LAW", "LOW")]);
    expect(r.score).toBe(10);
    expect(r.band).toBe("LOW");
    expect(r.deviationCount).toBe(0);
    // no drivers: all LOW, none deviating
    expect(r.drivers).toEqual([]);
  });

  it("lets ONE high deviating clause drive the score to HIGH even amid benign clauses", () => {
    const clauses = [cl("LIABILITY_CAP", "HIGH", true), ...Array.from({ length: 9 }, (_, i) => cl(`X${i}`, "LOW"))];
    const r = scoreContractClauses(clauses);
    expect(r.band).toBe("HIGH");
    expect(r.score).toBeGreaterThanOrEqual(60);
    expect(r.breakdown).toEqual({ high: 1, medium: 0, low: 9 });
    // the high deviating clause is the top driver
    expect(r.drivers[0].type).toBe("LIABILITY_CAP");
    expect(r.drivers[0].deviation).toBe(true);
  });

  it("counts deviations and ranks drivers by weight, capped at 5", () => {
    const clauses = [
      cl("A", "HIGH", true),   // 10
      cl("B", "MEDIUM", true), // 5
      cl("C", "HIGH"),         // 4
      cl("D", "MEDIUM"),       // 2
      cl("E", "LOW", true),    // 2.5
      cl("F", "LOW"),          // 1 (not a driver — LOW, non-deviating)
      cl("G", "LOW", true),    // 2.5
    ];
    const r = scoreContractClauses(clauses);
    expect(r.deviationCount).toBe(4);
    expect(r.drivers.length).toBe(5);
    expect(r.drivers[0].type).toBe("A");
    expect(r.drivers[0].points).toBe(10);
    // LOW non-deviating clause F is never a driver
    expect(r.drivers.find((d) => d.type === "F")).toBeUndefined();
  });

  it("is monotonic — adding a deviating high clause never lowers the score", () => {
    const base = scoreContractClauses([cl("A", "MEDIUM")]);
    const worse = scoreContractClauses([cl("A", "MEDIUM"), cl("B", "HIGH", true)]);
    expect(worse.score!).toBeGreaterThanOrEqual(base.score!);
  });
});
