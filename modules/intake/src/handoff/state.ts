/**
 * Item 6 (agent ↔ human hand-off) — pure baton-pass state machine.
 *
 * No DB, no React: given the current holder and a requested next holder,
 * decide whether the baton-pass is legal. The DB-backed service in
 * ./server.ts records the pass + audit; this module owns the semantics
 * so they're identical everywhere and unit-testable in isolation.
 *
 * The ticket never leaves the platform — a hand-off only changes *who
 * holds it*, one of:
 *   - "agent"  — an AI agent is processing / re-processing it
 *   - "human"  — a specific person owns it (attorney, paralegal, a tier)
 *   - "queue"  — parked, waiting for pickup / re-routing
 *
 * Legality rules:
 *   - The first pass (fromHolder = null) may set any holder.
 *   - agent → human is the core review gate (agent asks a human to look).
 *   - human → agent sends it back for re-processing.
 *   - human → human is a reassignment across people / tiers — allowed
 *     ONLY when the baton actually moves to a *different* person.
 *   - queue ↔ agent/human freely (park / pick up / auto-route).
 *   - A same-holder pass that doesn't move the baton is rejected — it
 *     isn't a hand-off, it's a no-op (keeps the log honest).
 */

export const HANDOFF_HOLDERS = ["agent", "human", "queue"] as const;
export type HandoffHolder = (typeof HANDOFF_HOLDERS)[number];

export interface HandoffRequest {
  fromHolder: HandoffHolder | null;
  toHolder: HandoffHolder;
  /** Current person holding the baton (when fromHolder = "human"). */
  fromUserId?: string | null;
  /** Person receiving the baton (required when toHolder = "human"). */
  toUserId?: string | null;
}

export interface HandoffDecision {
  ok: boolean;
  reason: string;
}

export function isHandoffHolder(v: unknown): v is HandoffHolder {
  return typeof v === "string" && (HANDOFF_HOLDERS as readonly string[]).includes(v);
}

export function validateHandoff(req: HandoffRequest): HandoffDecision {
  const { fromHolder, toHolder, fromUserId, toUserId } = req;

  if (!isHandoffHolder(toHolder)) {
    return { ok: false, reason: `Unknown target holder "${toHolder}"` };
  }
  // A human hand-off must name the person taking the baton.
  if (toHolder === "human" && !toUserId) {
    return { ok: false, reason: "A hand-off to a human must name the assignee" };
  }

  // First pass — any holder is a valid starting point.
  if (fromHolder == null) {
    return { ok: true, reason: "initial-handoff" };
  }

  if (!isHandoffHolder(fromHolder)) {
    return { ok: false, reason: `Unknown source holder "${fromHolder}"` };
  }

  // human → human is a reassignment; require it to actually move.
  if (fromHolder === "human" && toHolder === "human") {
    if (toUserId && fromUserId && toUserId === fromUserId) {
      return { ok: false, reason: "Already assigned to that person — nothing to hand off" };
    }
    return { ok: true, reason: "reassignment" };
  }

  // Any other same-holder pass is a no-op, not a hand-off.
  if (fromHolder === toHolder) {
    return { ok: false, reason: `Ticket is already held by "${toHolder}"` };
  }

  // Cross-holder passes are all legal (agent↔human, ↔queue).
  return { ok: true, reason: `${fromHolder}->${toHolder}` };
}
