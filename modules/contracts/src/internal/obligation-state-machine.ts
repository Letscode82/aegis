/**
 * Obligation lifecycle state machine (CLM Phase 2).
 *
 * The shared `Obligation` entity's `ObligationStatus` drives a contract's
 * commitments. Same guard shape as the contract state machine.
 *
 *   OPEN        → IN_PROGRESS, MET, WAIVED, BREACHED
 *   IN_PROGRESS → MET, WAIVED, BREACHED, OPEN
 *   MET         → OPEN                     (reopen — e.g. a recurring cycle)
 *   WAIVED      → OPEN                     (un-waive)
 *   BREACHED    → IN_PROGRESS, MET, WAIVED (cure / remediate / waive)
 *
 * Semantics: "satisfy" = → MET, "waive" = → WAIVED, "breach" = → BREACHED,
 * "start" = → IN_PROGRESS. The reminder/escalation engine (Phase 2c) is the
 * only actor that flips OPEN/IN_PROGRESS → BREACHED automatically on overdue;
 * humans do the rest through the guarded transition.
 */
import type { ObligationStatus } from "@aegis/db";

const TRANSITIONS: Record<ObligationStatus, ObligationStatus[]> = {
  OPEN: ["IN_PROGRESS", "MET", "WAIVED", "BREACHED"],
  IN_PROGRESS: ["MET", "WAIVED", "BREACHED", "OPEN"],
  MET: ["OPEN"],
  WAIVED: ["OPEN"],
  BREACHED: ["IN_PROGRESS", "MET", "WAIVED"],
};

export class IllegalObligationTransitionError extends Error {
  public readonly from: ObligationStatus;
  public readonly to: ObligationStatus;
  constructor(from: ObligationStatus, to: ObligationStatus) {
    super(
      `Illegal obligation status transition: ${from} -> ${to}. Allowed from ${from}: ${
        TRANSITIONS[from].join(", ") || "(terminal)"
      }`,
    );
    this.name = "IllegalObligationTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionObligation(from: ObligationStatus, to: ObligationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertObligationTransition(from: ObligationStatus, to: ObligationStatus): void {
  if (!canTransitionObligation(from, to)) {
    throw new IllegalObligationTransitionError(from, to);
  }
}

export function allowedObligationTransitions(from: ObligationStatus): ObligationStatus[] {
  return [...TRANSITIONS[from]];
}
