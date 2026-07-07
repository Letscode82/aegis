/**
 * Pure ladder rules — skip conditions, next-actionable resolution,
 * and RAG computation. No DB.
 */
import { describe, expect, it } from "vitest";
import {
  computeRag,
  nextActionable,
  shouldSkip,
  type StepShape,
  type TransitionShape,
} from "../src/rules";

const step = (
  stepOrder: number,
  extra: Partial<StepShape> = {},
): StepShape => ({
  stepOrder,
  name: `Step ${stepOrder}`,
  screenKey: `screen_${stepOrder}`,
  kind: "HUMAN",
  ...extra,
});

describe("shouldSkip", () => {
  const finance = step(4, {
    metadataJson: { skip_if: { field: "contract_value", op: "lt", value: 10000 } },
  });

  it("skips when the rule matches the context", () => {
    expect(shouldSkip(finance, { contract_value: 5000 })).toBe(true);
    expect(shouldSkip(finance, { contract_value: 50000 })).toBe(false);
  });

  it("a missing field or malformed rule never blocks the workflow", () => {
    expect(shouldSkip(finance, {})).toBe(false);
    expect(shouldSkip(step(1, { metadataJson: { skip_if: { field: "x", op: "nope", value: 1 } } }), { x: 1 })).toBe(false);
    expect(shouldSkip(step(1, { metadataJson: "garbage" }), { x: 1 })).toBe(false);
  });

  it("supports eq / in operators", () => {
    const s = step(6, { metadataJson: { skip_if: { field: "settlement_proposed", op: "eq", value: false } } });
    expect(shouldSkip(s, { settlement_proposed: false })).toBe(true);
    expect(shouldSkip(s, { settlement_proposed: true })).toBe(false);
    const inS = step(2, { metadataJson: { skip_if: { field: "region", op: "in", value: ["US", "EU"] } } });
    expect(shouldSkip(inS, { region: "US" })).toBe(true);
    expect(shouldSkip(inS, { region: "IN" })).toBe(false);
  });
});

describe("nextActionable", () => {
  const steps = [
    step(1),
    step(2, { metadataJson: { skip_if: { field: "v", op: "lt", value: 10 } } }),
    step(3),
  ];

  it("walks past skipped steps", () => {
    expect(nextActionable(steps, 1, { v: 5 })).toBe(3);
    expect(nextActionable(steps, 1, { v: 50 })).toBe(2);
  });

  it("returns null when the ladder is done", () => {
    expect(nextActionable(steps, 3, {})).toBeNull();
  });
});

describe("computeRag", () => {
  const steps = [step(1), step(2, { slaHours: 24 }), step(3)];
  const base = {
    steps,
    currentStepOrder: 2,
    status: "IN_PROGRESS" as const,
    context: {},
    stepEnteredAt: new Date("2026-07-01T00:00:00Z"),
  };

  it("green before, amber current, grey after", () => {
    const rag = computeRag({
      ...base,
      transitions: [],
      now: new Date("2026-07-01T01:00:00Z"),
    });
    expect(rag.map((r) => r.color)).toEqual(["green", "amber", "grey"]);
  });

  it("ages the current step to red past its SLA", () => {
    const rag = computeRag({
      ...base,
      transitions: [],
      now: new Date("2026-07-02T01:00:00Z"), // 25h > 24h SLA
    });
    expect(rag[1]!.color).toBe("red");
    expect(rag[1]!.overdue).toBe(true);
  });

  it("marks the source of a send-back red until re-approved", () => {
    const transitions: TransitionShape[] = [
      { fromStepOrder: 0, toStepOrder: 1, action: "START" },
      { fromStepOrder: 1, toStepOrder: 2, action: "APPROVE" },
      { fromStepOrder: 3, toStepOrder: 2, action: "SEND_BACK" },
    ];
    const rag = computeRag({ ...base, transitions, now: new Date("2026-07-01T01:00:00Z") });
    expect(rag[2]!.color).toBe("red"); // step 3 sent work back — red until re-approved
    const afterReapprove = computeRag({
      ...base,
      status: "COMPLETED",
      transitions: [...transitions, { fromStepOrder: 3, toStepOrder: null, action: "APPROVE" }],
      now: new Date("2026-07-01T01:00:00Z"),
    });
    expect(afterReapprove.every((r) => r.color === "green")).toBe(true);
  });

  it("renders skipped steps as skipped and completes everything green", () => {
    const rag = computeRag({
      steps: [step(1), step(2, { metadataJson: { skip_if: { field: "v", op: "lt", value: 10 } } }), step(3)],
      transitions: [],
      currentStepOrder: 3,
      status: "COMPLETED",
      context: { v: 5 },
      stepEnteredAt: new Date(),
    });
    expect(rag.map((r) => r.color)).toEqual(["green", "skipped", "green"]);
  });
});
