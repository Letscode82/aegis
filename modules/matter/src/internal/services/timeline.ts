/**
 * Matter timeline + audit-log helper.
 *
 * Every state-changing matter operation is twin-recorded:
 *   1. AuditLog row via @aegis/db.logAudit (D11 — chain-sealed).
 *   2. Event + MatterTimeline rows so the matter UI can render the
 *      chronological journal.
 *
 * AuditLog answers "who did what for compliance"; Event answers "what
 * happened for the product surfaces". Both writes happen here so module
 * code can't accidentally do one without the other.
 */
import {
  prisma,
  logAudit,
  type Prisma,
  type AuditActorType,
} from "@aegis/db";
import type { MatterActor } from "../types";

export interface RecordEventInput {
  matterId: string;
  actor: MatterActor;
  /** dot.notation — matter.created, matter.status.changed, matter.task.completed, … */
  eventType: string;
  /** Same dot.notation as eventType — used for AuditLog.action. */
  auditAction: string;
  /** Human-readable summary for the timeline UI. */
  summary: string;
  /** Polymorphic resource type for the AuditLog row. Default "Matter". */
  resourceType?: string;
  /** Polymorphic resource id for the AuditLog row. Default matterId. */
  resourceId?: string;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  /** Defaults to USER. Use AGENT for AI-actor writes (4d wires this). */
  actorType?: AuditActorType;
}

export async function recordMatterEvent(
  input: RecordEventInput,
): Promise<void> {
  const resourceType = input.resourceType ?? "Matter";
  const resourceId = input.resourceId ?? input.matterId;

  // Event + MatterTimeline first (these are product-surface writes).
  // The AuditLog write is fire-and-forget at the @aegis/db layer
  // already, so we don't await it for the storage transaction.
  const event = await prisma.event.create({
    data: {
      organizationId: input.actor.organizationId,
      type: input.eventType,
      sourceType: resourceType,
      sourceId: resourceId,
      actorId: input.actor.id,
      summary: input.summary,
      payload: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  // The matter's timeline is a curated index over Events. We attach
  // every matter-scoped event so the UI can render in one query.
  await prisma.matterTimeline.create({
    data: {
      matterId: input.matterId,
      eventId: event.id,
    },
  });

  await logAudit({
    organizationId: input.actor.organizationId,
    actorId: input.actor.id,
    actorType: input.actorType ?? "USER",
    action: input.auditAction,
    resourceType,
    resourceId,
    beforeJson: input.beforeJson ?? null,
    afterJson: input.afterJson ?? null,
    metadata: input.metadata ?? null,
  });
}
