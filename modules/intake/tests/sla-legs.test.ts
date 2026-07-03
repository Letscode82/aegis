/**
 * W2-4 (multi-leg SLA, issue #111) — pure per-leg clock semantics.
 */
import { describe, expect, it } from "vitest";
import { buildSlaLegs } from "../src/sla/legs";

const H = 3600 * 1000;
const T0 = Date.parse("2026-07-01T09:00:00.000Z");

describe("buildSlaLegs — no hand-offs yet", () => {
  it("is one queue leg from submission to now", () => {
    const r = buildSlaLegs({
      submittedTs: T0,
      slaHours: 24,
      handoffs: [],
      now: T0 + 6 * H,
    });
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]).toMatchObject({
      holder: "queue",
      holderLabel: "Intake queue",
      elapsedMs: 6 * H,
      pctOfSla: 25,
      active: true,
      breachedDuringLeg: false,
    });
    expect(r.breached).toBe(false);
    expect(r.closed).toBe(false);
  });
});

describe("buildSlaLegs — the agent pipeline story", () => {
  // Auto baton-pass writes two rows back-to-back: → agent, → human.
  const r = buildSlaLegs({
    submittedTs: T0,
    slaHours: 24,
    handoffs: [
      { toHolder: "agent", toUserId: null, atTs: T0 + 1 * H },
      { toHolder: "human", toUserId: "u-maya", toUserName: "Maya", atTs: T0 + 1 * H },
    ],
    now: T0 + 13 * H,
  });

  it("collapses the zero-length agent pass instead of emitting an empty leg", () => {
    expect(r.legs.map((l) => l.holder)).toEqual(["queue", "human"]);
  });

  it("labels the human leg with the resolved name and marks it active", () => {
    expect(r.legs[1]).toMatchObject({
      holderLabel: "Maya",
      holderUserId: "u-maya",
      elapsedMs: 12 * H,
      pctOfSla: 50,
      active: true,
    });
  });
});

describe("buildSlaLegs — a hand-off cannot hide a breach", () => {
  // Queue 2h → agent 1h → Maya 30h. SLA 24h ⇒ breach at T0+24h,
  // which lands inside Maya's leg.
  const r = buildSlaLegs({
    submittedTs: T0,
    slaHours: 24,
    handoffs: [
      { toHolder: "agent", toUserId: null, atTs: T0 + 2 * H },
      { toHolder: "human", toUserId: "u-maya", toUserName: "Maya", atTs: T0 + 3 * H },
    ],
    now: T0 + 33 * H,
  });

  it("keeps one window across all legs (no reset on pass)", () => {
    expect(r.breached).toBe(true);
    expect(r.totalElapsedMs).toBe(33 * H);
    expect(r.breachTs).toBe(T0 + 24 * H);
  });

  it("pins the breach to the leg holding the baton when the clock ran out", () => {
    expect(r.legs.map((l) => l.breachedDuringLeg)).toEqual([false, false, true]);
  });

  it("reports each leg's share of the window", () => {
    expect(r.legs.map((l) => l.pctOfSla)).toEqual([8, 4, 125]);
  });
});

describe("buildSlaLegs — closed tickets stop the clock", () => {
  const r = buildSlaLegs({
    submittedTs: T0,
    slaHours: 24,
    handoffs: [{ toHolder: "human", toUserId: "u-maya", atTs: T0 + 1 * H }],
    closedTs: T0 + 5 * H,
    now: T0 + 100 * H, // long after close — must not count
  });

  it("ends the final leg at the close instant, not now", () => {
    expect(r.closed).toBe(true);
    expect(r.totalElapsedMs).toBe(5 * H);
    expect(r.legs[1]?.elapsedMs).toBe(4 * H);
  });

  it("has no active leg after close", () => {
    expect(r.legs.every((l) => !l.active)).toBe(true);
  });

  it("falls back to the userId label when no name resolves", () => {
    expect(r.legs[1]?.holderLabel).toBe("u-maya");
  });
});

describe("buildSlaLegs — edge cases", () => {
  it("clamps clock-skewed passes into the ticket's life", () => {
    const r = buildSlaLegs({
      submittedTs: T0,
      slaHours: 8,
      handoffs: [{ toHolder: "agent", toUserId: null, atTs: T0 - 5 * H }],
      now: T0 + 2 * H,
    });
    // Pass clamps to submission → the queue leg is zero-length and
    // collapses; the agent leg spans the whole life.
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]).toMatchObject({ holder: "agent", elapsedMs: 2 * H });
  });

  it("tolerates a zero-hour SLA without dividing by zero", () => {
    const r = buildSlaLegs({
      submittedTs: T0,
      slaHours: 0,
      handoffs: [],
      now: T0 + 1 * H,
    });
    expect(r.legs[0]?.pctOfSla).toBe(0);
    expect(r.breached).toBe(false);
  });
});
