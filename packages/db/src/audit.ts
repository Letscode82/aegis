/**
 * Audit-log discipline (Differentiator #3).
 *
 * Every state-changing path in every module MUST call logAudit() — there
 * is no "this mutation is too small to log" exception. The audit log is
 * the single ledger that makes "conservative AI governance" real: every
 * AI-assisted approval, every override, every escalation has a row here.
 *
 * The helper is intentionally narrow. A caller hands us:
 *   - what changed (resourceType, resourceId)
 *   - who did it (actorId, actorType)
 *   - what they did (action — dot.notation)
 *   - the data envelope (beforeJson, afterJson) — so we can answer
 *     "what was the state when X happened" without joining other tables.
 *
 * The helper is async but callers can fire-and-forget when they don't
 * want to block on the write. The audit table is append-only; failures
 * surface in logs but never roll back the calling mutation.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./client";

export type AuditActorType = "USER" | "AGENT" | "SYSTEM";

export interface LogAuditInput {
  organizationId: string;
  /** null = system / non-user actor (agents, scheduler) */
  actorId?: string | null;
  actorType?: AuditActorType;
  /** dot.notation, e.g. "matter.created", "intake.recommendation.approved" */
  action: string;
  /** Polymorphic — the entity affected. */
  resourceType: string;
  resourceId: string;
  /** Pre-mutation state. Omit for create. */
  beforeJson?: Prisma.InputJsonValue | null;
  /** Post-mutation state. Omit for delete. */
  afterJson?: Prisma.InputJsonValue | null;
  /** Free-form context: ip, request id, agent confidence, … */
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Returns the created row's id (so callers can link it — e.g.
 * AgentDecision.resultingAuditLogId), or null if the append-only write
 * failed. Existing callers that `await logAudit(...)` and ignore the
 * return are unaffected — the change is purely additive.
 */
export async function logAudit(input: LogAuditInput): Promise<string | null> {
  try {
    const row = await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId ?? null,
        actorType: input.actorType ?? "USER",
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        beforeJson: (input.beforeJson ?? Prisma.DbNull) as Prisma.InputJsonValue,
        afterJson: (input.afterJson ?? Prisma.DbNull) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // The audit write must never roll back the caller's mutation. A
    // surfaced log line is the right level of noise here — alerting is
    // a job for the deployed log pipeline, not this helper.
    console.error("[@aegis/db] logAudit failed:", err);
    return null;
  }
}
