/**
 * E-signature — pure envelope helpers (C-5).
 *
 * The provider-agnostic core: the normalized lifecycle state machine, the
 * per-provider status normalizer, request validation, and a roll-up summary.
 * No I/O, no dependencies — exhaustively unit-tested. The Contracts module
 * gates APPROVED → EXECUTED on `isCompleted`, so the correctness of these
 * transitions is load-bearing.
 */
import type {
  CreateEnvelopeRequest,
  EnvelopeStatus,
  EnvelopeStatusValue,
  ESignatureProviderId,
  RecipientStatus,
} from "./types.js";

/** Terminal statuses — no further transition is legal. */
export const TERMINAL_STATUSES: ReadonlySet<EnvelopeStatusValue> = new Set(["completed", "declined", "voided"]);

/** Legal forward transitions of the normalized lifecycle. */
const TRANSITIONS: Record<EnvelopeStatusValue, ReadonlySet<EnvelopeStatusValue>> = {
  created: new Set(["sent", "voided"]),
  sent: new Set(["delivered", "completed", "declined", "voided"]),
  delivered: new Set(["completed", "declined", "voided"]),
  completed: new Set(),
  declined: new Set(),
  voided: new Set(),
};

export function isTerminal(status: EnvelopeStatusValue): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isCompleted(status: EnvelopeStatusValue): boolean {
  return status === "completed";
}

/** True when `to` is a legal next status from `from`. */
export function canTransition(from: EnvelopeStatusValue, to: EnvelopeStatusValue): boolean {
  if (from === to) return false;
  return TRANSITIONS[from].has(to);
}

/** Thrown by callers that want a hard guard around a transition. */
export class IllegalEnvelopeTransitionError extends Error {
  constructor(
    readonly from: EnvelopeStatusValue,
    readonly to: EnvelopeStatusValue,
  ) {
    super(`Illegal envelope transition ${from} → ${to}`);
    this.name = "IllegalEnvelopeTransitionError";
  }
}

export function assertTransition(from: EnvelopeStatusValue, to: EnvelopeStatusValue): void {
  if (!canTransition(from, to)) throw new IllegalEnvelopeTransitionError(from, to);
}

/**
 * Normalize a provider's native status string to the AEGIS lifecycle. Unknown
 * strings fall back to "sent" (in-flight) rather than throwing, so a surprising
 * provider value never strands an envelope.
 */
export function normalizeStatus(provider: ESignatureProviderId, raw: string): EnvelopeStatusValue {
  const s = raw.trim().toLowerCase();
  if (provider === "docusign") {
    switch (s) {
      case "created":
        return "created";
      case "sent":
        return "sent";
      case "delivered":
        return "delivered";
      case "completed":
      case "signed":
        return "completed";
      case "declined":
        return "declined";
      case "voided":
      case "void":
        return "voided";
      default:
        return "sent";
    }
  }
  // adobesign
  switch (s) {
    case "authoring":
    case "draft":
      return "created";
    case "out_for_signature":
    case "in_process":
      return "sent";
    case "signed":
    case "completed":
    case "approved":
      return "completed";
    case "declined":
      return "declined";
    case "cancelled":
    case "canceled":
    case "expired":
      return "voided";
    default:
      return "sent";
  }
}

/** Validate a create request; returns the list of problems (empty = valid). */
export function validateCreateRequest(req: CreateEnvelopeRequest): string[] {
  const problems: string[] = [];
  if (!req.subject?.trim()) problems.push("subject is required");
  if (!req.documents?.length) problems.push("at least one document is required");
  for (const d of req.documents ?? []) {
    if (!d.content?.byteLength) problems.push(`document "${d.name}" has no content`);
  }
  const signers = (req.recipients ?? []).filter((r) => (r.role ?? "signer") === "signer");
  if (signers.length === 0) problems.push("at least one signer is required");
  for (const r of req.recipients ?? []) {
    if (!/.+@.+\..+/.test(r.email)) problems.push(`recipient "${r.name || r.email}" has an invalid email`);
  }
  return problems;
}

export interface EnvelopeSummary {
  status: EnvelopeStatusValue;
  terminal: boolean;
  completed: boolean;
  totalSigners: number;
  signed: number;
  pending: number;
  declined: number;
  /** completed / declined / voided timestamp when known. */
  completedAt?: string;
}

/** Roll an envelope's per-recipient state into counts for the UI / audit note. */
export function summarizeEnvelope(status: EnvelopeStatus): EnvelopeSummary {
  const signers = status.recipients.filter((r: RecipientStatus) => r.status !== undefined);
  const signed = signers.filter((r) => r.status === "signed").length;
  const declined = signers.filter((r) => r.status === "declined").length;
  const pending = signers.filter((r) => r.status === "pending").length;
  return {
    status: status.status,
    terminal: isTerminal(status.status),
    completed: isCompleted(status.status),
    totalSigners: signers.length,
    signed,
    pending,
    declined,
    completedAt: status.completedAt,
  };
}
