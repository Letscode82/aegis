/**
 * Obligation reminder / escalation engine (CLM Phase 2c).
 *
 * `evaluateObligationBreaches` is pg-boss-ready (idempotent, structured
 * result) — the same pattern as intake's `evaluateSlaBreaches` and the 4c.5
 * defensibility jobs: an admin HTTP trigger today, `pg-boss.schedule()`
 * pointing at the same function when the worker runtime ships. It keeps the
 * obligation ledger self-maintaining: overdue commitments auto-breach and
 * carry an escalation tier, chain-sealed, without a human sweeping the list.
 */
import { prisma, logAudit } from "@aegis/db";
import { updateObligationStatus } from "./service";

const DAY_MS = 86_400_000;

export type EscalationTier = "owner" | "manager" | "executive";

/** Tiered escalation by how far overdue an obligation is. */
export function escalationTierForOverdue(daysOverdue: number): EscalationTier {
  if (daysOverdue > 30) return "executive";
  if (daysOverdue > 7) return "manager";
  return "owner";
}

export interface ObligationBreachResult {
  scanned: number;
  breached: number;
  breachedObligationIds: string[];
  asOf: string;
}

/**
 * Sweep overdue contract obligations → BREACHED.
 *
 * Idempotent: only OPEN / IN_PROGRESS obligations past their dueDate are
 * scanned, so already-BREACHED / MET / WAIVED rows are never re-touched and
 * a re-run cannot double-breach or double-audit. Each breach writes a
 * dedicated SYSTEM `contract.obligation.auto_breached` detection row (with
 * days-overdue + escalation tier) AND transitions the obligation to BREACHED
 * through the guarded, chain-sealed `updateObligationStatus` — matching the
 * two-row detection+flip contract of the SLA engine.
 */
export async function evaluateObligationBreaches(
  organizationId: string,
): Promise<ObligationBreachResult> {
  const now = new Date();
  const overdue = await prisma.obligation.findMany({
    where: {
      organizationId,
      sourceType: "CONTRACT",
      status: { in: ["OPEN", "IN_PROGRESS"] },
      dueDate: { lt: now }, // null dueDate never matches lt → excluded
    },
    select: { id: true, dueDate: true, sourceId: true, ownerId: true },
  });

  const breached: string[] = [];
  for (const o of overdue) {
    const daysOverdue = o.dueDate
      ? Math.floor((now.getTime() - new Date(o.dueDate).getTime()) / DAY_MS)
      : 0;
    const tier = escalationTierForOverdue(daysOverdue);

    // Detection audit (SYSTEM) — records that the engine breached this one.
    await logAudit({
      organizationId,
      actorId: null,
      actorType: "SYSTEM",
      action: "contract.obligation.auto_breached",
      resourceType: "Obligation",
      resourceId: o.id,
      afterJson: { contractId: o.sourceId, daysOverdue, escalationTier: tier, ownerId: o.ownerId },
      metadata: { source: "obligation-breach-sweep" },
    });

    // Guarded transition → BREACHED (also chain-seals status_changed +
    // stamps metadata.resolvedAt).
    await updateObligationStatus(
      organizationId,
      o.id,
      "BREACHED",
      { id: null, type: "SYSTEM" },
      { reason: `auto-breach: ${daysOverdue}d overdue (escalate: ${tier})` },
    );
    breached.push(o.id);
  }

  return {
    scanned: overdue.length,
    breached: breached.length,
    breachedObligationIds: breached,
    asOf: now.toISOString(),
  };
}
