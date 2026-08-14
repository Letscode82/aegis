/**
 * Erasure ↔ legal-hold conflict guard — the "one brain" differentiator.
 *
 * An ERASURE request must not delete data a legal hold requires us to
 * preserve (spoliation). This calls the Matter module's public surface
 * (`listActiveHoldsForPerson`) — never its internals — to see whether the data
 * subject is a non-released custodian on any active hold, records the finding
 * on the request, and chain-seals it. Fulfilment of an erasure is then blocked
 * in requests.ts unless a privacy officer records an explicit override reason.
 */
import { prisma, logAudit } from "@aegis/db";
import { listActiveHoldsForPerson, type ActiveHoldForPerson } from "@aegis/matter";
import type { Actor } from "./requests";

export interface HoldConflictResult {
  checkedAt: string;
  count: number;
  holds: Array<{ holdId: string; matterId: string; holdNumber: string | null; title: string; status: string }>;
  overridden: boolean;
  overrideReason: string | null;
}

/** Recompute and persist the erasure hold-conflict state for a request. */
export async function checkErasureHoldConflict(organizationId: string, requestId: string, actor: Actor): Promise<HoldConflictResult> {
  const req = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    select: { requesterPersonId: true, requestType: true, holdConflictOverrideReason: true },
  });
  if (!req) throw new Error("Request not found");

  const holds: ActiveHoldForPerson[] = await listActiveHoldsForPerson(organizationId, req.requesterPersonId);
  const now = new Date();
  await prisma.dataSubjectRequest.update({
    where: { id: requestId },
    data: { holdConflictCheckedAt: now, holdConflictCount: holds.length },
  });

  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
    action: "privacy.dsar.hold_conflict_checked", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { count: holds.length, holdIds: holds.map((h) => h.holdId) } as never,
    metadata: { source: "privacy", requestType: req.requestType } as never,
  });

  return {
    checkedAt: now.toISOString(),
    count: holds.length,
    holds: holds.map((h) => ({ holdId: h.holdId, matterId: h.matterId, holdNumber: h.holdNumber, title: h.title, status: h.status })),
    overridden: !!req.holdConflictOverrideReason,
    overrideReason: req.holdConflictOverrideReason,
  };
}

/** Record a privacy officer's explicit override so an erasure can proceed
 *  despite an active hold (e.g. the hold's scope excludes the subject's data).
 *  Chain-sealed; requests.ts reads the reason as the fulfilment gate release. */
export async function overrideHoldConflict(organizationId: string, requestId: string, reason: string, actor: Actor): Promise<HoldConflictResult> {
  if (!reason?.trim()) throw new Error("An override reason is required");
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");
  await prisma.dataSubjectRequest.update({ where: { id: requestId }, data: { holdConflictOverrideReason: reason.trim() } });
  await logAudit({
    organizationId, actorId: actor.id, actorType: actor.type ?? "USER",
    action: "privacy.dsar.hold_conflict_overridden", resourceType: "DataSubjectRequest", resourceId: requestId,
    afterJson: { reason: reason.trim() } as never, metadata: { source: "privacy" } as never,
  });
  return checkErasureHoldConflict(organizationId, requestId, actor);
}
