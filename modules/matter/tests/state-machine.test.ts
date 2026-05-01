import { describe, expect, it } from "vitest";
import {
  IllegalMatterTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
} from "../src/internal/services/state-machine";

describe("MatterStatus state machine", () => {
  it("permits the documented forward path", () => {
    expect(canTransition("DRAFT", "OPEN")).toBe(true);
    expect(canTransition("OPEN", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "STAYED")).toBe(true);
    expect(canTransition("STAYED", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "CLOSED")).toBe(true);
    expect(canTransition("CLOSED", "ARCHIVED")).toBe(true);
  });

  it("rejects skipping required intermediate states", () => {
    // Cannot go from ACTIVE directly to ARCHIVED — must close first.
    expect(canTransition("ACTIVE", "ARCHIVED")).toBe(false);
    expect(canTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransition("STAYED", "OPEN")).toBe(false);
  });

  it("treats ARCHIVED as terminal", () => {
    expect(allowedTransitions("ARCHIVED")).toEqual([]);
  });

  it("assertTransition throws IllegalMatterTransitionError on illegal moves", () => {
    expect(() => assertTransition("ACTIVE", "ARCHIVED")).toThrow(
      IllegalMatterTransitionError,
    );
    try {
      assertTransition("DRAFT", "CLOSED");
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalMatterTransitionError);
      const err = e as IllegalMatterTransitionError;
      expect(err.from).toBe("DRAFT");
      expect(err.to).toBe("CLOSED");
    }
  });

  it("STAYED ↔ ACTIVE round-trip is allowed", () => {
    assertTransition("ACTIVE", "STAYED");
    assertTransition("STAYED", "ACTIVE");
  });
});
