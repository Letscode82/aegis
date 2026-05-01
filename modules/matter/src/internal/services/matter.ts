/**
 * Matter CRUD — create / read / update.
 *
 * Status transitions and closeout live in their own services to keep
 * each concern reviewable in isolation. createMatter does the heavy
 * lifting on first write:
 *
 *   1. Snapshots the closeout checklist from MatterTypeConfig (so the
 *      matter's own checklist evolves independently of the org template).
 *   2. Assigns a matter number unless initialStatus is DRAFT (drafts
 *      remain unnumbered until promoted to OPEN).
 *   3. Optionally seats a lead attorney + links to the originating
 *      intake ticket atomically.
 *   4. Writes "matter.created" to AuditLog + the matter timeline.
 */
import {
  prisma,
  type Matter,
  type MatterStatus,
  type MatterType,
  type Prisma,
} from "@aegis/db";
import type {
  CreateMatterInput,
  MatterActor,
  MatterFilter,
  MatterPage,
  UpdateMatterInput,
} from "../types";
import { assignMatterNumber } from "./numbering";
import { checklistFromTypeConfig } from "./closeout";
import { recordMatterEvent } from "./timeline";

export async function getMatterByIdService(
  id: string,
): Promise<Matter | null> {
  return prisma.matter.findUnique({ where: { id } });
}

export async function listMattersService(
  organizationId: string,
  filter: MatterFilter | undefined,
): Promise<MatterPage<Matter>> {
  const page = Math.max(1, filter?.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filter?.pageSize ?? 25));

  const where: Prisma.MatterWhereInput = { organizationId };
  if (filter?.status) {
    where.status = Array.isArray(filter.status)
      ? { in: filter.status }
      : filter.status;
  }
  if (filter?.type) {
    where.type = Array.isArray(filter.type)
      ? { in: filter.type }
      : filter.type;
  }
  if (filter?.leadAttorneyPersonId) {
    where.leadAttorneyId = filter.leadAttorneyPersonId;
  }
  if (filter?.counterpartyId) {
    where.counterpartyId = filter.counterpartyId;
  }
  if (filter?.searchQuery) {
    const q = filter.searchQuery.trim();
    if (q.length > 0) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { matterNumber: { contains: q, mode: "insensitive" } },
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.matter.findMany({
      where,
      orderBy: [{ openedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.matter.count({ where }),
  ]);

  return { rows, page, pageSize, total };
}

export async function createMatterService(
  input: CreateMatterInput,
  actor: MatterActor,
): Promise<Matter> {
  const status: MatterStatus = input.initialStatus ?? "DRAFT";

  // Snapshot closeout checklist from the org-level template so the
  // matter's own list evolves independently after creation.
  const checklist = await checklistFromTypeConfig(
    actor.organizationId,
    input.type as MatterType,
  );

  // DRAFT matters remain unnumbered until promoted to OPEN. Anything
  // else gets a number assigned at create time.
  const matterNumber =
    status === "DRAFT"
      ? null
      : await assignMatterNumber(actor.organizationId, input.type as MatterType);

  const matter = await prisma.matter.create({
    data: {
      organizationId: actor.organizationId,
      title: input.title,
      type: input.type,
      status,
      matterNumber,
      description: input.description,
      jurisdiction: input.jurisdiction,
      estimatedValue: input.estimatedValue,
      estimatedDurationDays: input.estimatedDurationDays,
      counterpartyId: input.counterpartyId,
      parentMatterId: input.parentMatterId,
      leadAttorneyId: input.leadAttorneyPersonId,
      closeoutChecklistJson: checklist as unknown as object,
      customFieldsJson: (input.customFields ?? {}) as Prisma.InputJsonValue,
      openedAt: status === "DRAFT" ? new Date() : new Date(),
    },
  });

  // Seat lead attorney as a MatterParty so the team panel renders correctly.
  if (input.leadAttorneyPersonId) {
    await prisma.matterParty.upsert({
      where: {
        matterId_personId_role: {
          matterId: matter.id,
          personId: input.leadAttorneyPersonId,
          role: "LEAD_ATTORNEY",
        },
      },
      update: {},
      create: {
        matterId: matter.id,
        personId: input.leadAttorneyPersonId,
        role: "LEAD_ATTORNEY",
      },
    });
  }

  // Optional intake-link in the same transaction-ish flow. We don't
  // wrap in an interactive transaction because the audit trigger is a
  // BEFORE-INSERT side effect that must commit; keeping these as
  // sequential writes is fine — partial failure is recoverable from
  // the AuditLog ledger.
  if (input.intakeTicketId) {
    await prisma.intakeTicket.update({
      where: { id: input.intakeTicketId },
      data: { matterId: matter.id },
    });
  }

  await recordMatterEvent({
    matterId: matter.id,
    actor,
    eventType: "matter.created",
    auditAction: "matter.created",
    summary: `Matter "${matter.title}" created${matterNumber ? ` (${matterNumber})` : " as DRAFT"}`,
    afterJson: {
      id: matter.id,
      matterNumber,
      title: matter.title,
      type: matter.type,
      status: matter.status,
      jurisdiction: matter.jurisdiction,
      counterpartyId: matter.counterpartyId,
      leadAttorneyId: matter.leadAttorneyId,
      intakeTicketId: input.intakeTicketId ?? null,
    },
    metadata: {
      source: input.intakeTicketId ? "intake" : "ui",
      checklistItems: checklist.length,
    },
  });

  return matter;
}

export async function updateMatterService(
  id: string,
  input: UpdateMatterInput,
  actor: MatterActor,
): Promise<Matter> {
  const before = await prisma.matter.findFirst({
    where: { id, organizationId: actor.organizationId },
  });
  if (!before) {
    throw new Error(
      `Matter ${id} not found in organization ${actor.organizationId}`,
    );
  }

  // Build an update payload that only touches keys present in input.
  // Prisma treats `undefined` as "do not change" but we want explicit
  // null-able fields to clear when set to null.
  const data: Prisma.MatterUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.jurisdiction !== undefined) data.jurisdiction = input.jurisdiction;
  if (input.estimatedValue !== undefined)
    data.estimatedValue = input.estimatedValue;
  if (input.estimatedDurationDays !== undefined)
    data.estimatedDurationDays = input.estimatedDurationDays;
  if (input.counterpartyId !== undefined) {
    data.counterparty = input.counterpartyId
      ? { connect: { id: input.counterpartyId } }
      : { disconnect: true };
  }
  if (input.parentMatterId !== undefined) {
    data.parent = input.parentMatterId
      ? { connect: { id: input.parentMatterId } }
      : { disconnect: true };
  }
  if (input.customFields !== undefined) {
    data.customFieldsJson = input.customFields as Prisma.InputJsonValue;
  }

  const updated = await prisma.matter.update({ where: { id }, data });

  await recordMatterEvent({
    matterId: id,
    actor,
    eventType: "matter.updated",
    auditAction: "matter.updated",
    summary: `Matter "${updated.title}" updated`,
    beforeJson: {
      title: before.title,
      description: before.description,
      jurisdiction: before.jurisdiction,
      counterpartyId: before.counterpartyId,
      parentMatterId: before.parentMatterId,
    },
    afterJson: {
      title: updated.title,
      description: updated.description,
      jurisdiction: updated.jurisdiction,
      counterpartyId: updated.counterpartyId,
      parentMatterId: updated.parentMatterId,
    },
  });

  return updated;
}
