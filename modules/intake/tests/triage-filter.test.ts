/**
 * Regression tests for the Cockpit awaiting-triage predicate.
 *
 * The original filter matched stage==="new" only. Post-P1b, the
 * create path (form + Copilot) lands tickets at stage="assigned"
 * once the agent attaches its recommendation — those tickets were
 * neither "awaiting" (stage !== "new") nor "already triaged"
 * (no triagedBy), so they vanished from the Cockpit queue and the
 * header pill undercounted. `isAwaitingTriage` is the single shared
 * predicate for both surfaces.
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { isAwaitingTriage } = await import("../src/intake/triage-filter.js" as any);

const base = { triagedBy: null, status: "Awaiting Triage" };

describe("isAwaitingTriage()", () => {
  it.each([
    ["seeded ticket at stage=new", { ...base, stage: "new" }, true],
    [
      "live-created ticket after agent ran (the P1b regression)",
      { ...base, stage: "assigned", status: "Assigned" },
      true,
    ],
    [
      "mid-flight optimistic triage flash stays out (no recommendation yet)",
      { ...base, stage: "triage" },
      false,
    ],
    [
      "attorney-approved ticket leaves the queue",
      { stage: "complete", status: "Completed", triagedBy: "Dana Smith" },
      false,
    ],
    [
      "rejected ticket leaves the queue (triagedBy set)",
      { stage: "triage", status: "Triage — Rejected by Attorney", triagedBy: "Dana Smith" },
      false,
    ],
    [
      "snoozed ticket hidden even though stage resets to new",
      { ...base, stage: "new", status: "Snoozed" },
      false,
    ],
    [
      "assigned ticket already triaged is not double-counted",
      { stage: "assigned", status: "Assigned", triagedBy: "Dana Smith" },
      false,
    ],
  ])("%s", (_label, ticket, expected) => {
    expect(isAwaitingTriage(ticket)).toBe(expected);
  });
});
