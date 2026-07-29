/**
 * Contract lifecycle state machine (CLM Phase 1).
 *
 * Mirrors the matter state machine. The `ContractStatus` enum maps onto the
 * commercial lifecycle:
 *
 *   DRAFT           → the contract is being prepared
 *   IN_NEGOTIATION  → terms are being negotiated with the counterparty
 *   IN_REVIEW       → in the approval ladder (AI risk review + legal/GC sign-off)
 *   APPROVED        → approved, awaiting signature
 *   EXECUTED        → signed by all parties
 *   ACTIVE          → in force (obligation clocks run here)
 *   EXPIRED         → past expiry, not yet renewed/terminated
 *   TERMINATED      → ended (terminal)
 *
 * Allowed transitions:
 *
 *   DRAFT          → IN_NEGOTIATION, IN_REVIEW, TERMINATED
 *   IN_NEGOTIATION → IN_REVIEW, DRAFT, TERMINATED
 *   IN_REVIEW      → APPROVED, IN_NEGOTIATION, TERMINATED   (ladder can send back)
 *   APPROVED       → EXECUTED, IN_NEGOTIATION, TERMINATED   (reopen if terms change)
 *   EXECUTED       → ACTIVE, TERMINATED
 *   ACTIVE         → EXPIRED, TERMINATED, IN_NEGOTIATION    (amend / renew round-trip)
 *   EXPIRED        → IN_NEGOTIATION, ACTIVE, TERMINATED     (renew reactivates)
 *   TERMINATED     → (terminal)
 *
 * The transition itself is the structural move only; timestamp side-effects
 * (executedAt / activatedAt / renewedAt / terminatedAt / statusChangedAt) are
 * stamped by transitionContractStatus() in service.ts, and the approval
 * ladder is what advances a contract through the IN_REVIEW state.
 */
import type { ContractStatus } from "@aegis/db";

const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["IN_NEGOTIATION", "IN_REVIEW", "TERMINATED"],
  IN_NEGOTIATION: ["IN_REVIEW", "DRAFT", "TERMINATED"],
  IN_REVIEW: ["APPROVED", "IN_NEGOTIATION", "TERMINATED"],
  APPROVED: ["EXECUTED", "IN_NEGOTIATION", "TERMINATED"],
  EXECUTED: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["EXPIRED", "TERMINATED", "IN_NEGOTIATION"],
  EXPIRED: ["IN_NEGOTIATION", "ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

export class IllegalContractTransitionError extends Error {
  public readonly from: ContractStatus;
  public readonly to: ContractStatus;
  constructor(from: ContractStatus, to: ContractStatus) {
    super(
      `Illegal contract status transition: ${from} -> ${to}. Allowed from ${from}: ${
        TRANSITIONS[from].join(", ") || "(terminal)"
      }`,
    );
    this.name = "IllegalContractTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertContractTransition(from: ContractStatus, to: ContractStatus): void {
  if (!canTransitionContract(from, to)) {
    throw new IllegalContractTransitionError(from, to);
  }
}

export function allowedContractTransitions(from: ContractStatus): ContractStatus[] {
  return [...TRANSITIONS[from]];
}
