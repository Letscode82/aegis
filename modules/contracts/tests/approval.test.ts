import { describe, it, expect } from "vitest";
import { mapSteps, findingsFromRisk } from "../src/internal/approval";
import { scoreContractClauses } from "../src/internal/risk-score";

// The clm_contract_approval ladder shape (packages/workflow/src/library.ts).
const steps = [
  { stepOrder: 1, name: "Draft & Submit", kind: "HUMAN", approverRole: "requester", slaHours: null },
  { stepOrder: 2, name: "AI Risk Review", kind: "AGENT", approverRole: "attorney", slaHours: 8 },
  { stepOrder: 3, name: "Legal Review", kind: "HUMAN", approverRole: "attorney", slaHours: 48 },
  { stepOrder: 4, name: "Finance Review", kind: "HUMAN", approverRole: "legal_ops", slaHours: 48 },
  { stepOrder: 5, name: "GC Approval", kind: "HUMAN", approverRole: "gc", slaHours: 72 },
  { stepOrder: 6, name: "Counter-signature", kind: "HUMAN", approverRole: "gc", slaHours: 72 },
];
const inst = (status: string, currentStepOrder: number) => ({ status, currentStepOrder, definition: { steps } });

describe("mapSteps — ladder step-state derivation", () => {
  it("marks steps before current done, current current, rest upcoming", () => {
    const out = mapSteps(inst("IN_PROGRESS", 3));
    expect(out.map((s) => s.state)).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks the opening step current when the ladder just started", () => {
    const out = mapSteps(inst("IN_PROGRESS", 1));
    expect(out[0].state).toBe("current");
    expect(out.slice(1).every((s) => s.state === "upcoming")).toBe(true);
  });

  it("marks every step done once the ladder is COMPLETED", () => {
    const out = mapSteps(inst("COMPLETED", 6));
    expect(out.every((s) => s.state === "done")).toBe(true);
  });

  it("preserves ladder order, kind and approver role", () => {
    const out = mapSteps(inst("IN_PROGRESS", 2));
    expect(out.map((s) => s.stepOrder)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out[1].kind).toBe("AGENT");
    expect(out[4].approverRole).toBe("gc");
  });

  it("surfaces RAG only on the current step (null elsewhere)", () => {
    const out = mapSteps(inst("IN_PROGRESS", 3));
    expect(out.filter((s) => s.rag != null).every((s) => s.state === "current")).toBe(true);
  });

  it("attaches the latest agent task's findings to the AGENT step only", () => {
    const tasks = [
      { stepOrder: 2, status: "ESCALATED", outputJson: { confidence: 0.4, suggestedAction: "escalate", summary: "risky", minConfidence: 0.8, detail: { score: 72, band: "HIGH", deviationCount: 2, drivers: [{ type: "INDEMNITY", risk: "HIGH", deviation: true, points: 10 }] } } },
    ];
    const out = mapSteps(inst("IN_PROGRESS", 2), tasks);
    // HUMAN steps carry no findings.
    expect(out[0].findings).toBeNull();
    expect(out[2].findings).toBeNull();
    // The AGENT step reflects the task output.
    expect(out[1].findings?.status).toBe("ESCALATED");
    expect(out[1].findings?.band).toBe("HIGH");
    expect(out[1].findings?.score).toBe(72);
    expect(out[1].findings?.drivers).toHaveLength(1);
  });

  it("AGENT step with no task has null findings", () => {
    const out = mapSteps(inst("IN_PROGRESS", 2), []);
    expect(out[1].kind).toBe("AGENT");
    expect(out[1].findings).toBeNull();
  });
});

describe("findingsFromRisk — advisory AI Risk Review output", () => {
  it("clean low-risk contract clears the confidence bar (DONE-eligible)", () => {
    const risk = scoreContractClauses([{ type: "GOVERNING_LAW", risk: "LOW", deviation: false }]);
    const f = findingsFromRisk(risk);
    expect(f.suggestedAction).toBe("approve");
    expect(f.confidence).toBeGreaterThanOrEqual(0.8);
    expect(f.detail?.band).toBe("LOW");
  });

  it("high-risk deviating contract falls below the bar (escalates)", () => {
    const risk = scoreContractClauses([
      { type: "INDEMNITY", risk: "HIGH", deviation: true },
      { type: "LIABILITY_CAP", risk: "HIGH", deviation: true },
    ]);
    const f = findingsFromRisk(risk);
    expect(f.suggestedAction).toBe("escalate");
    expect(f.confidence).toBeLessThan(0.8);
  });

  it("no clauses → manual review, mid confidence, unscored band", () => {
    const f = findingsFromRisk(scoreContractClauses([]));
    expect(f.suggestedAction).toBe("review-manually");
    expect(f.confidence).toBe(0.5);
    expect(f.detail?.band).toBe("UNSCORED");
  });

  it("confidence is always clamped to [0,1]", () => {
    const risk = scoreContractClauses(Array.from({ length: 6 }, () => ({ type: "IP", risk: "HIGH" as const, deviation: true })));
    const f = findingsFromRisk(risk);
    expect(f.confidence).toBeGreaterThanOrEqual(0);
    expect(f.confidence).toBeLessThanOrEqual(1);
  });
});
