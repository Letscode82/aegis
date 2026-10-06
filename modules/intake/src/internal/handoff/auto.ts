/**
 * W2-2 · Auto baton-pass (issue #109) — pure row-builder for the
 * hand-off ledger entries the agent pipeline writes automatically.
 *
 * When a ticket is first processed by an agent, the custody story is
 * two passes: (prior → agent) while the agent worked, then
 * (agent → reviewer|queue) when the draft is ready — or agent → queue
 * when no agent matched. Nobody has to remember to log it; the
 * chain-of-custody populates itself.
 */

export interface AutoBatonRow {
  fromHolder: string | null;
  toHolder: "agent" | "human" | "queue";
  toUserId: string | null;
  reason: string;
}

export interface AutoBatonPlan {
  rows: AutoBatonRow[];
  /** Final denormalized holder state for the ticket. */
  finalHolder: "human" | "queue";
  finalUserId: string | null;
}

export function buildAutoBatonRows(input: {
  /** Ticket's current denormalized holder (null on first processing). */
  currentHolder: string | null;
  /** Typed assignee at processing time (routing may have set one). */
  assignedToUserId: string | null;
  /** "drafted" when an agent produced a recommendation; "no-match"
   *  when no agent claimed the ticket. */
  outcome: "drafted" | "no-match";
}): AutoBatonPlan {
  const { currentHolder, assignedToUserId, outcome } = input;
  const toHuman = outcome === "drafted" && !!assignedToUserId;

  const rows: AutoBatonRow[] = [
    {
      fromHolder: currentHolder,
      toHolder: "agent",
      toUserId: null,
      reason:
        outcome === "drafted"
          ? "Agent triage started"
          : "Router evaluated the ticket",
    },
    {
      fromHolder: "agent",
      toHolder: toHuman ? "human" : "queue",
      toUserId: toHuman ? assignedToUserId : null,
      reason:
        outcome === "drafted"
          ? toHuman
            ? "Agent draft ready — passed to the assignee for review"
            : "Agent draft ready — queued for attorney review"
          : "No agent matched — queued for manual triage",
    },
  ];

  return {
    rows,
    finalHolder: toHuman ? "human" : "queue",
    finalUserId: toHuman ? assignedToUserId : null,
  };
}
