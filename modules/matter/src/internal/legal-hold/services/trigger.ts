/**
 * Trigger event capture (capability 1).
 *
 * `recordHoldTrigger` adds a HoldTriggerEvent row + writes
 * TRIGGER_RECORDED to the chain. Used when an existing hold gains
 * new triggering context after creation (e.g. preservation duty
 * scope expands due to a regulator inquiry).
 */
import { prisma } from "@aegis/db";
import type { HoldActor } from "../types";
import { recordHoldEvent } from "./timeline";

export async function recordHoldTriggerService(
  holdId: string,
  eventDescription: string,
  occurredAt: Date,
  actor: HoldActor,
): Promise<void> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: holdId, organizationId: actor.organizationId },
    select: { id: true, triggeredAt: true },
  });
  if (!hold) throw new Error(`Hold ${holdId} not found`);

  await prisma.holdTriggerEvent.create({
    data: {
      legalHoldId: holdId,
      eventDescription,
      occurredAt,
      recordedById: actor.id,
    },
  });

  // First trigger sets the hold's triggeredAt timestamp.
  if (!hold.triggeredAt) {
    await prisma.legalHold.update({
      where: { id: holdId },
      data: { triggeredAt: occurredAt, triggerEventDescription: eventDescription },
    });
  }

  await recordHoldEvent({
    legalHoldId: holdId,
    organizationId: actor.organizationId,
    actor,
    type: "TRIGGER_RECORDED",
    summary: `Trigger recorded — ${eventDescription.slice(0, 80)}`,
    auditAction: "matter.legal_hold.trigger_recorded",
    afterJson: {
      eventDescription,
      occurredAt: occurredAt.toISOString(),
    },
  });
}
