/**
 * W2-2 (auto baton-pass, issue #109) — pure row-builder the agent
 * pipeline uses to self-populate the hand-off ledger on first
 * processing. The chokepoint writes the rows; this suite locks the
 * semantics of what gets written.
 */
import { describe, expect, it } from "vitest";
import { buildAutoBatonRows } from "../src/handoff/auto";

describe("buildAutoBatonRows — drafted with an assignee", () => {
  const plan = buildAutoBatonRows({
    currentHolder: null,
    assignedToUserId: "u-maya",
    outcome: "drafted",
  });

  it("writes exactly two passes", () => {
    expect(plan.rows).toHaveLength(2);
  });

  it("first pass hands the baton to the agent", () => {
    expect(plan.rows[0]).toEqual({
      fromHolder: null,
      toHolder: "agent",
      toUserId: null,
      reason: "Agent triage started",
    });
  });

  it("second pass lands on the assignee for review", () => {
    expect(plan.rows[1]).toEqual({
      fromHolder: "agent",
      toHolder: "human",
      toUserId: "u-maya",
      reason: "Agent draft ready — passed to the assignee for review",
    });
  });

  it("final denormalized state is the human assignee", () => {
    expect(plan.finalHolder).toBe("human");
    expect(plan.finalUserId).toBe("u-maya");
  });
});

describe("buildAutoBatonRows — drafted, nobody assigned", () => {
  const plan = buildAutoBatonRows({
    currentHolder: null,
    assignedToUserId: null,
    outcome: "drafted",
  });

  it("second pass queues the draft for attorney review", () => {
    expect(plan.rows[1]).toEqual({
      fromHolder: "agent",
      toHolder: "queue",
      toUserId: null,
      reason: "Agent draft ready — queued for attorney review",
    });
  });

  it("final denormalized state is the queue, no user", () => {
    expect(plan.finalHolder).toBe("queue");
    expect(plan.finalUserId).toBeNull();
  });
});

describe("buildAutoBatonRows — no agent matched", () => {
  const plan = buildAutoBatonRows({
    currentHolder: null,
    // Routing may still have assigned someone; a no-match pass goes to
    // the queue regardless — there is no draft to review.
    assignedToUserId: "u-maya",
    outcome: "no-match",
  });

  it("first pass records the router evaluation", () => {
    expect(plan.rows[0]?.reason).toBe("Router evaluated the ticket");
    expect(plan.rows[0]?.toHolder).toBe("agent");
  });

  it("second pass queues for manual triage even with an assignee", () => {
    expect(plan.rows[1]).toEqual({
      fromHolder: "agent",
      toHolder: "queue",
      toUserId: null,
      reason: "No agent matched — queued for manual triage",
    });
    expect(plan.finalHolder).toBe("queue");
    expect(plan.finalUserId).toBeNull();
  });
});

describe("buildAutoBatonRows — prior holder is preserved", () => {
  it("threads an existing holder into the first pass's fromHolder", () => {
    const plan = buildAutoBatonRows({
      currentHolder: "queue",
      assignedToUserId: null,
      outcome: "drafted",
    });
    expect(plan.rows[0]?.fromHolder).toBe("queue");
    expect(plan.rows[1]?.fromHolder).toBe("agent");
  });
});
