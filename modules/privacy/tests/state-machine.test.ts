import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isTerminal, allowedTransitions, stageIndex, IllegalDsarTransitionError } from "../src/internal/state-machine";

describe("DSAR state machine", () => {
  it("allows the forward lifecycle", () => {
    expect(canTransition("RECEIVED", "VERIFYING")).toBe(true);
    expect(canTransition("VERIFYING", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "AWAITING_REVIEW")).toBe(true);
    expect(canTransition("AWAITING_REVIEW", "FULFILLED")).toBe(true);
  });
  it("allows going back one step from review to collect", () => {
    expect(canTransition("AWAITING_REVIEW", "IN_PROGRESS")).toBe(true);
  });
  it("forbids skipping and illegal jumps", () => {
    expect(canTransition("RECEIVED", "AWAITING_REVIEW")).toBe(false);
    expect(canTransition("VERIFYING", "FULFILLED")).toBe(false);
  });
  it("allows reject/withdraw from any working state", () => {
    for (const s of ["RECEIVED", "VERIFYING", "IN_PROGRESS", "AWAITING_REVIEW"] as const) {
      expect(canTransition(s, "REJECTED")).toBe(true);
      expect(canTransition(s, "WITHDRAWN")).toBe(true);
    }
  });
  it("terminal states have no exits", () => {
    for (const s of ["FULFILLED", "REJECTED", "WITHDRAWN"] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(allowedTransitions(s)).toEqual([]);
    }
    expect(isTerminal("IN_PROGRESS")).toBe(false);
  });
  it("assertTransition throws on illegal, no-ops on same", () => {
    expect(() => assertTransition("RECEIVED", "FULFILLED")).toThrow(IllegalDsarTransitionError);
    expect(() => assertTransition("RECEIVED", "RECEIVED")).not.toThrow();
  });
  it("stageIndex orders the lifecycle and returns -1 for terminal branches", () => {
    expect(stageIndex("RECEIVED")).toBe(0);
    expect(stageIndex("AWAITING_REVIEW")).toBe(3);
    expect(stageIndex("REJECTED")).toBe(-1);
  });
});
