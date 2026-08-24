import { describe, it, expect } from "vitest";
import { aggregateValidationRuns, type ValidationRunRow } from "../src/validation";

const row = (p: Partial<ValidationRunRow>): ValidationRunRow => ({
  id: "r", reviewSetId: "rs", reviewSetName: "Set", profileLabel: "Ad-hoc criteria",
  dimension: "RESPONSIVE", createdAt: "2026-01-01T00:00:00.000Z",
  recall: null, precision: null, f1: null, overturn: null, n: 0, ...p,
});

describe("aggregateValidationRuns", () => {
  it("groups by profile and averages metrics", () => {
    const d = aggregateValidationRuns([
      row({ id: "a", profileLabel: "Contract v3", recall: 0.8, precision: 0.9, f1: 0.85, overturn: 0.1, createdAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "b", profileLabel: "Contract v3", recall: 0.9, precision: 0.7, f1: 0.79, overturn: 0.2, createdAt: "2026-02-01T00:00:00.000Z" }),
      row({ id: "c", profileLabel: "Ad-hoc criteria", recall: 0.5, precision: 0.5, f1: 0.5, overturn: 0.4 }),
    ]);
    expect(d.totalRuns).toBe(3);
    expect(d.scoredRuns).toBe(3);
    const contract = d.groups.find((g) => g.profileLabel === "Contract v3")!;
    expect(contract.runs).toBe(2);
    expect(contract.avg.recall).toBeCloseTo(0.85, 3);
    // latest = most recent by createdAt
    expect(contract.latest?.recall).toBe(0.9);
    expect(contract.trend.map((t) => t.recall)).toEqual([0.8, 0.9]); // chronological
  });

  it("orders groups by run count desc", () => {
    const d = aggregateValidationRuns([
      row({ profileLabel: "A", recall: 0.5 }),
      row({ profileLabel: "B", recall: 0.5 }),
      row({ profileLabel: "B", recall: 0.6 }),
    ]);
    expect(d.groups[0]!.profileLabel).toBe("B");
  });

  it("treats null metrics as unscored and excludes them from averages", () => {
    const d = aggregateValidationRuns([
      row({ profileLabel: "X", recall: 0.8 }),
      row({ profileLabel: "X", recall: null }),
    ]);
    expect(d.scoredRuns).toBe(1);
    expect(d.overall.recall).toBe(0.8); // null excluded, not treated as 0
  });

  it("returns null averages when nothing is scored", () => {
    const d = aggregateValidationRuns([row({})]);
    expect(d.overall.recall).toBeNull();
    expect(d.scoredRuns).toBe(0);
  });
});
