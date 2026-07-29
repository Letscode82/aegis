import { describe, it, expect } from "vitest";
import { mapSteps } from "../src/internal/approval";

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
});
