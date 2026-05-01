/**
 * Matter status transitions + close.
 *
 * transitionMatterStatusService is the structural transition. It
 * enforces the state machine and writes an audit row but does NOT
 * apply business gates beyond the structural transitions; closeMatter
 * (below) layers in the closeout checklist gate.
 *
 * Promoting DRAFT -> OPEN also assigns a matter number on the way
 * out so DRAFT matters never carry a number until they're real.
 */
import { prisma, type Matter, type MatterStatus, type MatterType } from "@aegis/db";
import type { CloseoutData, MatterActor } from "../types";
import { assertCloseoutComplete, readChecklist } from "./closeout";
import { assignMatterNumber } from "./numbering";
import { recordMatterEvent } from "./timeline";
import { assertTransition } from "./state-machine";

export async function transitionMatterStatusService(
  id: string,
  newStatus: MatterStatus,
  actor: MatterActor,
  reason: string | undefined,
): Promise<Matter> {
  const before = await prisma.matter.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!before) {
    throw new Error(
      `Matter ${id} not found in organization ${actor.organizationId}`,
    );
  }
  if (before.status === newStatus) return before;

  assertTransition(before.status, newStatus);

  // CLOSED has its own dedicated path with checklist gating. Reject
  // direct transitions to CLOSED here so the gate isn't bypassed.
  if (newStatus === "CLOSED") {
    throw new Error(
      "Use closeMatter() to transition to CLOSED — it enforces the closeout checklist.",
    );
  }

  // Promoting DRAFT -> OPEN assigns a matter number on the way out.
  let matterNumber = before.matterNumber;
  if (before.status === "DRAFT" && newStatus === "OPEN" && !matterNumber) {
    matterNumber = await assignMatterNumber(
      actor.organizationId,
      before.type as MatterType,
    );
  }

  const updated = await prisma.matter.update({
    where: { id },
    data: {
      status: newStatus,
      matterNumber,
    },
  });

  await recordMatterEvent({
    matterId: id,
    actor,
    eventType: "matter.status.changed",
    auditAction: "matter.status.changed",
    summary: `Status: ${before.status} -> ${newStatus}${reason ? ` (${reason})` : ""}`,
    beforeJson: { status: before.status, matterNumber: before.matterNumber },
    afterJson: { status: newStatus, matterNumber },
    metadata: { reason: reason ?? null },
  });

  return updated;
}

export async function closeMatterService(
  id: string,
  actor: MatterActor,
  closeoutData: CloseoutData,
): Promise<Matter> {
  const before = await prisma.matter.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!before) {
    throw new Error(
      `Matter ${id} not found in organization ${actor.organizationId}`,
    );
  }
  if (before.status === "CLOSED" || before.status === "ARCHIVED") {
    return before;
  }

  // Structural transition — must be a permitted source.
  assertTransition(before.status, "CLOSED");

  // Closeout checklist gate.
  const checklist = readChecklist(before.closeoutChecklistJson);
  assertCloseoutComplete(checklist);

  const closedAt = new Date();
  const updated = await prisma.matter.update({
    where: { id },
    data: { status: "CLOSED", closedAt },
  });

  await recordMatterEvent({
    matterId: id,
    actor,
    eventType: "matter.closed",
    auditAction: "matter.closed",
    summary: `Matter closed${closeoutData.closureNote ? ` — ${closeoutData.closureNote}` : ""}`,
    beforeJson: { status: before.status },
    afterJson: { status: "CLOSED", closedAt: closedAt.toISOString() },
    metadata: {
      closureNote: closeoutData.closureNote ?? null,
      checklistItemCount: checklist.length,
    },
  });

  return updated;
}
