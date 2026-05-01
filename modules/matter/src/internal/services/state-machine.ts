/**
 * Matter status state machine.
 *
 * Allowed transitions (DRAFT is the entry state for AI-assisted creation;
 * matters created from Intake skip directly to OPEN):
 *
 *   DRAFT    -> OPEN, ARCHIVED
 *   OPEN     -> ACTIVE, STAYED, CLOSED, ARCHIVED
 *   ACTIVE   -> STAYED, CLOSED
 *   STAYED   -> ACTIVE, CLOSED
 *   CLOSED   -> ARCHIVED
 *   ARCHIVED -> (terminal)
 *
 * CLOSED is additionally gated by the closeout checklist — every
 * required item on Matter.closeoutChecklistJson must be marked
 * completed before the transition is allowed. The gate is enforced
 * by closeMatter() in services/closeout.ts; transitionMatterStatus()
 * itself is the structural transition only.
 */
import type { MatterStatus } from "@aegis/db";

const TRANSITIONS: Record<MatterStatus, MatterStatus[]> = {
  DRAFT: ["OPEN", "ARCHIVED"],
  OPEN: ["ACTIVE", "STAYED", "CLOSED", "ARCHIVED"],
  ACTIVE: ["STAYED", "CLOSED"],
  STAYED: ["ACTIVE", "CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
};

export class IllegalMatterTransitionError extends Error {
  public readonly from: MatterStatus;
  public readonly to: MatterStatus;
  constructor(from: MatterStatus, to: MatterStatus) {
    super(
      `Illegal matter status transition: ${from} -> ${to}. Allowed from ${from}: ${
        TRANSITIONS[from].join(", ") || "(terminal)"
      }`,
    );
    this.name = "IllegalMatterTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(
  from: MatterStatus,
  to: MatterStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: MatterStatus,
  to: MatterStatus,
): void {
  if (!canTransition(from, to)) {
    throw new IllegalMatterTransitionError(from, to);
  }
}

export function allowedTransitions(from: MatterStatus): MatterStatus[] {
  return [...TRANSITIONS[from]];
}
