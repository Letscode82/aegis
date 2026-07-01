/**
 * Item 6 (agent ↔ human hand-off) — pure baton-pass state machine.
 */
import { describe, expect, it } from "vitest";
import {
  HANDOFF_HOLDERS,
  isHandoffHolder,
  validateHandoff,
} from "../src/handoff/state";

describe("handoff holders", () => {
  it("recognises the three canonical holders", () => {
    expect(HANDOFF_HOLDERS).toEqual(["agent", "human", "queue"]);
    expect(isHandoffHolder("agent")).toBe(true);
    expect(isHandoffHolder("human")).toBe(true);
    expect(isHandoffHolder("queue")).toBe(true);
    expect(isHandoffHolder("robot")).toBe(false);
    expect(isHandoffHolder(null)).toBe(false);
  });
});

describe("validateHandoff — initial pass", () => {
  it("allows any starting holder on the first pass", () => {
    expect(validateHandoff({ fromHolder: null, toHolder: "agent" }).ok).toBe(true);
    expect(validateHandoff({ fromHolder: null, toHolder: "queue" }).ok).toBe(true);
    expect(
      validateHandoff({ fromHolder: null, toHolder: "human", toUserId: "u1" }).ok,
    ).toBe(true);
  });

  it("requires a named assignee for a human hand-off", () => {
    const d = validateHandoff({ fromHolder: null, toHolder: "human" });
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/must name the assignee/i);
  });
});

describe("validateHandoff — core gates", () => {
  it("allows agent → human (review gate)", () => {
    expect(
      validateHandoff({ fromHolder: "agent", toHolder: "human", toUserId: "u1" }).ok,
    ).toBe(true);
  });

  it("allows human → agent (send back for re-processing)", () => {
    expect(validateHandoff({ fromHolder: "human", toHolder: "agent" }).ok).toBe(true);
  });

  it("allows queue ↔ agent/human", () => {
    expect(validateHandoff({ fromHolder: "queue", toHolder: "agent" }).ok).toBe(true);
    expect(
      validateHandoff({ fromHolder: "queue", toHolder: "human", toUserId: "u1" }).ok,
    ).toBe(true);
    expect(validateHandoff({ fromHolder: "agent", toHolder: "queue" }).ok).toBe(true);
  });
});

describe("validateHandoff — reassignment + no-ops", () => {
  it("allows human → human when the person actually changes", () => {
    const d = validateHandoff({
      fromHolder: "human",
      toHolder: "human",
      fromUserId: "u1",
      toUserId: "u2",
    });
    expect(d.ok).toBe(true);
    expect(d.reason).toBe("reassignment");
  });

  it("rejects human → human to the same person", () => {
    const d = validateHandoff({
      fromHolder: "human",
      toHolder: "human",
      fromUserId: "u1",
      toUserId: "u1",
    });
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/nothing to hand off/i);
  });

  it("rejects a same-holder no-op pass (agent → agent, queue → queue)", () => {
    expect(validateHandoff({ fromHolder: "agent", toHolder: "agent" }).ok).toBe(false);
    expect(validateHandoff({ fromHolder: "queue", toHolder: "queue" }).ok).toBe(false);
  });

  it("rejects an unknown target holder", () => {
    const d = validateHandoff({ fromHolder: "agent", toHolder: "robot" as never });
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/unknown target holder/i);
  });
});
