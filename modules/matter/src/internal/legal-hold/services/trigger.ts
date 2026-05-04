/**
 * Trigger event capture (capability 1).
 *
 * `recordHoldTrigger` adds the FIRST HoldTriggerEvent row + writes
 * TRIGGER_RECORDED to the chain. `updateHoldTrigger` (4c.4) edits
 * the existing trigger description / occurredAt and writes
 * TRIGGER_UPDATED — distinguished from the initial recording so
 * the chain reader can spot post-hoc edits to the
 * "when did duty attach" anchor.
 */
import { prisma, type HoldTriggerEvent } from "@aegis/db";
import type { HoldActor } from "../types";
import { recordHoldEvent } from "./timeline";

export interface TriggerEventDTO {
  id: string;
  occurredAt: string;
  eventDescription: string;
  recordedById: string;
  recordedAt: string;
}

export async function getHoldTriggerEventService(
  holdId: string,
  organizationId: string,
): Promise<TriggerEventDTO | null> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: holdId, organizationId },
    select: { id: true },
  });
  if (!hold) return null;
  const trigger = await prisma.holdTriggerEvent.findFirst({
    where: { legalHoldId: holdId },
    orderBy: [{ recordedAt: "desc" }],
  });
  if (!trigger) return null;
  return toDTO(trigger);
}

function toDTO(t: HoldTriggerEvent): TriggerEventDTO {
  return {
    id: t.id,
    occurredAt: t.occurredAt.toISOString(),
    eventDescription: t.eventDescription,
    recordedById: t.recordedById,
    recordedAt: t.recordedAt.toISOString(),
  };
}

export interface UpdateHoldTriggerInput {
  holdId: string;
  triggerEventId: string;
  eventDescription: string;
  occurredAt: Date;
}

export async function updateHoldTriggerService(
  input: UpdateHoldTriggerInput,
  actor: HoldActor,
): Promise<void> {
  const existing = await prisma.holdTriggerEvent.findFirst({
    where: { id: input.triggerEventId, legalHoldId: input.holdId },
    include: { legalHold: { select: { organizationId: true } } },
  });
  if (!existing) throw new Error(`Trigger event ${input.triggerEventId} not found`);
  if (existing.legalHold.organizationId !== actor.organizationId) {
    throw new Error("Cross-org access refused");
  }

  await prisma.holdTriggerEvent.update({
    where: { id: input.triggerEventId },
    data: {
      eventDescription: input.eventDescription,
      occurredAt: input.occurredAt,
    },
  });

  // Mirror the edit onto the denormalised hold fields so the
  // workspace summary stays consistent.
  await prisma.legalHold.update({
    where: { id: input.holdId },
    data: {
      triggeredAt: input.occurredAt,
      triggerEventDescription: input.eventDescription,
    },
  });

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "TRIGGER_UPDATED",
    summary: `Trigger event updated — ${input.eventDescription.slice(0, 80)}`,
    auditAction: "matter.legal_hold.trigger_updated",
    beforeJson: {
      eventDescription: existing.eventDescription,
      occurredAt: existing.occurredAt.toISOString(),
    },
    afterJson: {
      eventDescription: input.eventDescription,
      occurredAt: input.occurredAt.toISOString(),
    },
  });
}

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
