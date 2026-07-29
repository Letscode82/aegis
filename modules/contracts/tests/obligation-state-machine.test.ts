import { describe, it, expect } from "vitest";
import {
  canTransitionObligation,
  assertObligationTransition,
  allowedObligationTransitions,
  IllegalObligationTransitionError,
} from "../src/internal/obligation-state-machine";

describe("obligation state machine", () => {
  it("permits satisfy / waive / breach / start from OPEN", () => {
    for (const to of ["IN_PROGRESS", "MET", "WAIVED", "BREACHED"] as const) {
      expect(canTransitionObligation("OPEN", to)).toBe(true);
    }
  });

  it("permits remediation from BREACHED", () => {
    expect(canTransitionObligation("BREACHED", "MET")).toBe(true);
    expect(canTransitionObligation("BREACHED", "IN_PROGRESS")).toBe(true);
    expect(canTransitionObligation("BREACHED", "WAIVED")).toBe(true);
  });

  it("permits reopen from MET and WAIVED", () => {
    expect(canTransitionObligation("MET", "OPEN")).toBe(true);
    expect(canTransitionObligation("WAIVED", "OPEN")).toBe(true);
  });

  it("rejects an illegal move (MET → BREACHED)", () => {
    expect(canTransitionObligation("MET", "BREACHED")).toBe(false);
    expect(allowedObligationTransitions("MET")).toEqual(["OPEN"]);
  });

  it("assertObligationTransition throws with from/to", () => {
    try {
      assertObligationTransition("MET", "BREACHED");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalObligationTransitionError);
      expect((e as IllegalObligationTransitionError).from).toBe("MET");
      expect((e as IllegalObligationTransitionError).to).toBe("BREACHED");
    }
  });
});
