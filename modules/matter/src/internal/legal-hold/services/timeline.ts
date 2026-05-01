/**
 * Hold-event twin-recording.
 *
 * Mirrors `recordMatterEvent` from 4a. Every state-changing legal-
 * hold operation goes through `recordHoldEvent()` which writes both
 * a LegalHoldEvent (product surface — drives the timeline UI) AND
 * an AuditLog row (compliance ledger — chain-sealed via the 4a
 * trigger). The two writes are linked: `LegalHoldEvent.resultingAuditLogId`
 * references the AuditLog row.
 *
 * AuditLog row failure does not roll back the LegalHoldEvent — the
 * audit-write helper at `@aegis/db.logAudit` is best-effort. The
 * AgentDecision gate (commitment G) hooks here too: callers pass
 * an optional `agentDecisionId` whose APPROVED status is verified
 * before the mutation runs (gate ships dormant in 4b — no
 * AgentDecision rows exist yet).
 */
import {
  Prisma,
  prisma,
  type AuditActorType,
  type LegalHoldEventType,
} from "@aegis/db";
import type { HoldActor } from "../types";

export class AgentDecisionPendingError extends Error {
  constructor(public readonly agentDecisionId: string) {
    super(
      `Agent decision ${agentDecisionId} has not reached APPROVED status; refusing to mutate.`,
    );
    this.name = "AgentDecisionPendingError";
  }
}

export interface RecordHoldEventInput {
  legalHoldId: string;
  organizationId: string;
  actor: HoldActor | null;
  /** Defaults to USER. SYSTEM for pg-boss-driven reminders, AGENT for AI. */
  actorType?: AuditActorType;
  type: LegalHoldEventType;
  /** Human-readable summary for the timeline UI. */
  summary: string;
  /** dot.notation, e.g. "matter.legal_hold.issued". */
  auditAction: string;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  /** When set, the gate refuses to write unless this AgentDecision is APPROVED. */
  agentDecisionId?: string;
}

export async function recordHoldEvent(
  input: RecordHoldEventInput,
): Promise<void> {
  // Conservative AI governance — refuse to mutate if a referenced
  // AgentDecision is still pending. The table is empty in 4b so this
  // path never triggers; 4d wires real decisions.
  if (input.agentDecisionId) {
    const decision = await prisma.agentDecision.findUnique({
      where: { id: input.agentDecisionId },
      select: { approvalStatus: true },
    });
    if (
      !decision ||
      (decision.approvalStatus !== "APPROVED" &&
        decision.approvalStatus !== "APPROVED_WITH_OVERRIDE")
    ) {
      throw new AgentDecisionPendingError(input.agentDecisionId);
    }
  }

  // 1) AuditLog (chain-sealed by Postgres trigger). Returns the row
  //    so we can link the LegalHoldEvent back to it.
  const auditRow = await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actor?.id ?? null,
      actorType: input.actorType ?? "USER",
      action: input.auditAction,
      resourceType: "LegalHold",
      resourceId: input.legalHoldId,
      beforeJson: (input.beforeJson ?? Prisma.DbNull) as Prisma.InputJsonValue,
      afterJson: (input.afterJson ?? Prisma.DbNull) as Prisma.InputJsonValue,
      metadata: (input.metadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  });

  // 2) LegalHoldEvent — product-surface stream that drives the
  //    matter / hold timeline UI. Linked back to the AuditLog so
  //    defensibility export can prove the twin-record relationship.
  await prisma.legalHoldEvent.create({
    data: {
      legalHoldId: input.legalHoldId,
      type: input.type,
      summary: input.summary,
      payloadJson: (input.afterJson ??
        input.beforeJson ??
        Prisma.DbNull) as Prisma.InputJsonValue,
      actorId: input.actor?.id ?? null,
      actorType: input.actorType ?? "USER",
      resultingAuditLogId: auditRow.id,
    },
  });

  // Note: we use prisma.auditLog.create directly rather than
  // @aegis/db's logAudit() helper because we need the inserted row's
  // id to populate `LegalHoldEvent.resultingAuditLogId`. The chain
  // trigger seals (1) the same way it seals helper-driven writes —
  // the only difference is that failure here propagates to the
  // caller (legal-hold mutations refuse to commit if audit fails),
  // whereas logAudit swallows errors. Hold-side requires the
  // stronger guarantee.
}
