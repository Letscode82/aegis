/**
 * DSAR lifecycle state machine (pure). Maps the incumbent
 * "Gather → Authenticate → Collect → Review → Deliver" flow onto the
 * DSARStatus enum, and encodes the only legal transitions. Guards that need
 * DB state (identity verified before work starts; erasure hold-conflict
 * resolved before fulfilment) are enforced in requests.ts — this file owns
 * the graph shape so the workspace stepper and the server agree on one source
 * of truth.
 */
import type { DSARStatus } from "@aegis/db";

export interface DsarStageMeta {
  status: DSARStatus;
  label: string;
  phase: string;
  description: string;
}

/** Ordered lifecycle for the workspace stepper. Terminal branches excluded. */
export const DSAR_STAGES: DsarStageMeta[] = [
  { status: "RECEIVED", label: "Intake", phase: "Gather", description: "Request logged; requester and type captured." },
  { status: "VERIFYING", label: "Identity", phase: "Authenticate", description: "Verify the requester is the data subject before disclosing anything." },
  { status: "IN_PROGRESS", label: "Collect", phase: "Collect", description: "Map personal-data locations and gather records for review." },
  { status: "AWAITING_REVIEW", label: "Review", phase: "Review", description: "AI-assisted relevance review; a human confirms every item and redactions." },
  { status: "FULFILLED", label: "Deliver", phase: "Deliver", description: "Response package delivered to the data subject; case closed." },
];

export const TERMINAL_STATUSES: ReadonlySet<DSARStatus> = new Set<DSARStatus>(["FULFILLED", "REJECTED", "WITHDRAWN"]);

export function isTerminal(status: DSARStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

const TRANSITIONS: Record<DSARStatus, DSARStatus[]> = {
  RECEIVED: ["VERIFYING", "IN_PROGRESS", "REJECTED", "WITHDRAWN"],
  VERIFYING: ["IN_PROGRESS", "RECEIVED", "REJECTED", "WITHDRAWN"],
  IN_PROGRESS: ["AWAITING_REVIEW", "REJECTED", "WITHDRAWN"],
  AWAITING_REVIEW: ["FULFILLED", "IN_PROGRESS", "REJECTED", "WITHDRAWN"],
  FULFILLED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function allowedTransitions(from: DSARStatus): DSARStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: DSARStatus, to: DSARStatus): boolean {
  return allowedTransitions(from).includes(to);
}

export class IllegalDsarTransitionError extends Error {
  constructor(from: DSARStatus, to: DSARStatus) {
    super(`Illegal DSAR transition ${from} → ${to}`);
    this.name = "IllegalDsarTransitionError";
  }
}

export function assertTransition(from: DSARStatus, to: DSARStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) throw new IllegalDsarTransitionError(from, to);
}

/** Zero-based index in the ordered lifecycle (terminal → -1). */
export function stageIndex(status: DSARStatus): number {
  return DSAR_STAGES.findIndex((s) => s.status === status);
}
