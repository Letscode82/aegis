import { describe, it, expect } from "vitest";
import {
  summarizeDiff,
  assessRisk,
  deterministicNarrative,
  buildNarrativePrompt,
} from "../src/internal/narrative";
import type { ClauseChange, ContractDiff } from "../src/internal/versions";

const clause = (over: Partial<{ type: string; text: string; summary: string | null; risk: "LOW" | "MEDIUM" | "HIGH"; deviation: boolean }> = {}) => ({
  type: "LIABILITY_CAP", text: "…", summary: null, risk: "LOW" as const, deviation: false, ...over,
});

const mkDiff = (changes: ClauseChange[], counts?: Partial<ContractDiff["counts"]>): ContractDiff => ({
  fromVersion: 1, toVersion: 2, changes,
  counts: { added: 0, removed: 0, changed: 0, unchanged: 0, ...counts },
});

describe("summarizeDiff", () => {
  it("counts added / removed / changed and deviation deltas", () => {
    const changes: ClauseChange[] = [
      { kind: "added", key: "PAYMENT#0", type: "PAYMENT", to: clause({ type: "PAYMENT", deviation: true }) },
      { kind: "removed", key: "WARRANTY#0", type: "WARRANTY", from: clause({ type: "WARRANTY", deviation: true }) },
      { kind: "changed", key: "LIABILITY_CAP#0", type: "LIABILITY_CAP", from: clause({ risk: "LOW", deviation: false }), to: clause({ risk: "HIGH", deviation: true }), fields: ["risk", "deviation"] },
    ];
    const s = summarizeDiff(changes);
    expect(s.added).toBe(1);
    expect(s.removed).toBe(1);
    expect(s.changed).toBe(1);
    expect(s.deviationsIntroduced).toBe(2); // added-deviating + flipped-to-deviating
    expect(s.deviationsResolved).toBe(1);   // removed-deviating
    expect(s.riskUp).toBe(1);
    expect(s.riskDown).toBe(0);
  });
});

describe("assessRisk", () => {
  it("UNCHANGED when nothing moves", () => {
    expect(assessRisk({ added: 0, removed: 0, changed: 0, deviationsIntroduced: 0, deviationsResolved: 0, riskUp: 0, riskDown: 0 })).toBe("UNCHANGED");
  });
  it("HIGHER when only up-moves", () => {
    expect(assessRisk({ added: 1, removed: 0, changed: 0, deviationsIntroduced: 1, deviationsResolved: 0, riskUp: 1, riskDown: 0 })).toBe("HIGHER");
  });
  it("LOWER when only down-moves", () => {
    expect(assessRisk({ added: 0, removed: 1, changed: 0, deviationsIntroduced: 0, deviationsResolved: 1, riskUp: 0, riskDown: 1 })).toBe("LOWER");
  });
  it("MIXED when both directions move", () => {
    expect(assessRisk({ added: 1, removed: 1, changed: 0, deviationsIntroduced: 1, deviationsResolved: 1, riskUp: 0, riskDown: 0 })).toBe("MIXED");
  });
});

describe("deterministicNarrative", () => {
  it("summarizes an amendment that introduces a deviation as HIGHER risk", () => {
    const diff = mkDiff([
      { kind: "changed", key: "LIABILITY_CAP#0", type: "LIABILITY_CAP", from: clause({ risk: "MEDIUM", deviation: false }), to: clause({ risk: "HIGH", deviation: true }), fields: ["risk", "deviation", "text"] },
    ], { changed: 1 });
    const n = deterministicNarrative(diff);
    expect(n.riskAssessment).toBe("HIGHER");
    expect(n.headline).toContain("v1 → v2");
    expect(n.keyPoints.length).toBeGreaterThan(0);
    expect(n.narrative.toLowerCase()).toContain("risk");
  });
  it("handles an empty diff", () => {
    const n = deterministicNarrative(mkDiff([]));
    expect(n.riskAssessment).toBe("UNCHANGED");
    expect(n.keyPoints).toEqual([]);
  });
});

describe("buildNarrativePrompt", () => {
  it("includes the version pair, the title, and each change line, and asks for strict JSON", () => {
    const diff = mkDiff([
      { kind: "added", key: "PAYMENT#0", type: "PAYMENT", to: clause({ type: "PAYMENT", text: "Net 15 upfront", deviation: true }) },
    ], { added: 1 });
    const p = buildNarrativePrompt(diff, "Globex Supply Agreement");
    expect(p).toContain("Globex Supply Agreement");
    expect(p).toContain("Version 1 → version 2");
    expect(p).toContain("ADDED PAYMENT");
    expect(p).toContain("Net 15 upfront");
    expect(p).toContain("STRICT JSON");
  });
});
