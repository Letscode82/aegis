/**
 * Hold lifecycle — draft → issue → active → partially_released →
 * released. Every transition twin-records via `recordHoldEvent`.
 */
import { prisma, type LegalHold, type LegalHoldStatus } from "@aegis/db";
import type {
  AmendHoldScopeInput,
  CreateLegalHoldInput,
  HoldActor,
  IssueLegalHoldInput,
  PartiallyReleaseCustodianInput,
  ReleaseLegalHoldInput,
} from "../types";
import { resolveEffectivePolicy, effectiveCadenceDays } from "./policy";
import { nextHoldNumber } from "./numbering";
import { pickTemplateForJurisdiction } from "./notice-template";
import { recordHoldEvent } from "./timeline";

export class IllegalHoldTransitionError extends Error {
  constructor(
    public readonly from: LegalHoldStatus,
    public readonly to: LegalHoldStatus,
  ) {
    super(`Illegal legal-hold transition: ${from} -> ${to}`);
    this.name = "IllegalHoldTransitionError";
  }
}

const TRANSITIONS: Record<LegalHoldStatus, LegalHoldStatus[]> = {
  DRAFT: ["ISSUED", "RELEASED"],
  ISSUED: ["ACTIVE", "PARTIALLY_RELEASED", "RELEASED"],
  ACTIVE: ["PARTIALLY_RELEASED", "RELEASED"],
  PARTIALLY_RELEASED: ["ACTIVE", "RELEASED"],
  RELEASED: [],
};

function assertTransition(from: LegalHoldStatus, to: LegalHoldStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new IllegalHoldTransitionError(from, to);
  }
}

export async function createLegalHoldService(
  input: CreateLegalHoldInput,
  actor: HoldActor,
): Promise<LegalHold> {
  const matter = await prisma.matter.findFirst({
    where: { id: input.matterId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!matter) {
    throw new Error(
      `Matter ${input.matterId} not found in organization ${actor.organizationId}`,
    );
  }

  const created = await prisma.legalHold.create({
    data: {
      organizationId: actor.organizationId,
      matterId: input.matterId,
      title: input.title,
      scopeDescription: input.scopeDescription,
      jurisdictions: input.jurisdictions ?? [],
      status: "DRAFT",
      triggeredAt: input.triggeredAt ?? null,
      triggerEventDescription: input.triggerEventDescription ?? null,
      affectsDepartedCustodians: input.affectsDepartedCustodians ?? false,
      privilegeFlags: (input.privilegeFlags ?? {}) as object,
      createdById: actor.id,
    },
  });

  await recordHoldEvent({
    legalHoldId: created.id,
    organizationId: actor.organizationId,
    actor,
    type: "HOLD_DRAFTED",
    summary: `Hold drafted: ${input.title}`,
    auditAction: "matter.legal_hold.drafted",
    afterJson: {
      id: created.id,
      title: created.title,
      jurisdictions: created.jurisdictions,
      matterId: created.matterId,
    },
  });

  if (input.triggerEventDescription) {
    await prisma.holdTriggerEvent.create({
      data: {
        legalHoldId: created.id,
        eventDescription: input.triggerEventDescription,
        occurredAt: input.triggeredAt ?? new Date(),
        recordedById: actor.id,
      },
    });
    await recordHoldEvent({
      legalHoldId: created.id,
      organizationId: actor.organizationId,
      actor,
      type: "TRIGGER_RECORDED",
      summary: `Trigger recorded: ${input.triggerEventDescription.slice(0, 80)}`,
      auditAction: "matter.legal_hold.trigger_recorded",
      afterJson: {
        eventDescription: input.triggerEventDescription,
        occurredAt: (input.triggeredAt ?? new Date()).toISOString(),
      },
    });
  }

  return created;
}

export async function issueLegalHoldService(
  input: IssueLegalHoldInput,
  actor: HoldActor,
): Promise<LegalHold> {
  const before = await prisma.legalHold.findFirst({
    where: { id: input.holdId, organizationId: actor.organizationId },
  });
  if (!before) throw new Error(`Hold ${input.holdId} not found`);

  assertTransition(before.status, "ISSUED");

  const template = await pickTemplateForJurisdiction(
    actor.organizationId,
    before.jurisdictions[0] ?? null,
  );
  if (input.noticeTemplateId && template?.id !== input.noticeTemplateId) {
    // Caller picked a specific template — load it directly.
    const explicit = await prisma.holdNoticeTemplate.findFirst({
      where: {
        id: input.noticeTemplateId,
        organizationId: actor.organizationId,
      },
    });
    if (!explicit)
      throw new Error(`Template ${input.noticeTemplateId} not found`);
  }
  const tpl = await prisma.holdNoticeTemplate.findFirstOrThrow({
    where: {
      id: input.noticeTemplateId,
      organizationId: actor.organizationId,
    },
  });

  // Snapshot the effective policy onto the hold so future org-level
  // policy changes don't retroactively shift this hold.
  const policy = await resolveEffectivePolicy(actor.organizationId, before.id);
  const cadenceDays = effectiveCadenceDays(policy, before.jurisdictions);
  const dueDate = new Date(Date.now() + cadenceDays * 24 * 60 * 60 * 1000);

  // Assign holdNumber if absent.
  const holdNumber = before.holdNumber ?? (await nextHoldNumber(actor.organizationId));
  const issuedAt = new Date();

  const updated = await prisma.legalHold.update({
    where: { id: before.id },
    data: {
      holdNumber,
      status: "ISSUED",
      issuedAt,
      customPolicyJson: policy as unknown as object,
    },
  });

  // Seed custodian rows for the requested recipients.
  for (const personId of input.recipientCustodianPersonIds) {
    await prisma.legalHoldCustodian.upsert({
      where: { legalHoldId_personId: { legalHoldId: before.id, personId } },
      update: {},
      create: {
        legalHoldId: before.id,
        personId,
        nextReAttestationDueAt: dueDate,
      },
    });
  }

  // Issuance row — content-hash snapshot.
  await prisma.holdNoticeIssuance.create({
    data: {
      legalHoldId: before.id,
      templateId: tpl.id,
      templateVersion: tpl.version,
      bodyHashAtIssuance: tpl.bodyHash,
      recipientCount: input.recipientCustodianPersonIds.length,
      issuedById: actor.id,
    },
  });

  await recordHoldEvent({
    legalHoldId: before.id,
    organizationId: actor.organizationId,
    actor,
    type: "HOLD_ISSUED",
    summary: `Hold issued — ${input.recipientCustodianPersonIds.length} custodians notified`,
    auditAction: "matter.legal_hold.issued",
    beforeJson: { status: before.status },
    afterJson: {
      status: "ISSUED",
      holdNumber,
      issuedAt: issuedAt.toISOString(),
      templateId: tpl.id,
      templateVersion: tpl.version,
      bodyHashAtIssuance: tpl.bodyHash,
    },
    metadata: { cadenceDays, jurisdictions: before.jurisdictions },
  });

  return updated;
}

export async function releaseLegalHoldService(
  input: ReleaseLegalHoldInput,
  actor: HoldActor,
): Promise<LegalHold> {
  const before = await prisma.legalHold.findFirst({
    where: { id: input.holdId, organizationId: actor.organizationId },
  });
  if (!before) throw new Error(`Hold ${input.holdId} not found`);

  assertTransition(before.status, "RELEASED");

  const releasedAt = new Date();
  const updated = await prisma.legalHold.update({
    where: { id: before.id },
    data: {
      status: "RELEASED",
      releasedAt,
      releasedById: actor.id,
      releaseReason: input.releaseReason,
    },
  });

  // Mark every still-active custodian row released too.
  await prisma.legalHoldCustodian.updateMany({
    where: { legalHoldId: before.id, releasedAt: null },
    data: { releasedAt, releaseReason: input.releaseReason },
  });

  await recordHoldEvent({
    legalHoldId: before.id,
    organizationId: actor.organizationId,
    actor,
    type: "HOLD_RELEASED",
    summary: `Hold released — ${input.releaseReason}`,
    auditAction: "matter.legal_hold.released",
    beforeJson: { status: before.status },
    afterJson: {
      status: "RELEASED",
      releasedAt: releasedAt.toISOString(),
      reason: input.releaseReason,
    },
  });

  return updated;
}

export async function partiallyReleaseCustodianService(
  input: PartiallyReleaseCustodianInput,
  actor: HoldActor,
): Promise<void> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: input.holdId, organizationId: actor.organizationId },
  });
  if (!hold) throw new Error(`Hold ${input.holdId} not found`);
  if (hold.status === "RELEASED")
    throw new IllegalHoldTransitionError(hold.status, "PARTIALLY_RELEASED");

  const releasedAt = new Date();
  await prisma.legalHoldCustodian.update({
    where: {
      legalHoldId_personId: {
        legalHoldId: input.holdId,
        personId: input.personId,
      },
    },
    data: { releasedAt, releaseReason: input.releaseReason },
  });

  // Promote hold status to PARTIALLY_RELEASED if it isn't already.
  if (hold.status !== "PARTIALLY_RELEASED") {
    await prisma.legalHold.update({
      where: { id: input.holdId },
      data: { status: "PARTIALLY_RELEASED" },
    });
  }

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_PARTIALLY_RELEASED",
    summary: `Custodian ${input.personId} released — ${input.releaseReason}`,
    auditAction: "matter.legal_hold.custodian.partially_released",
    afterJson: {
      personId: input.personId,
      releasedAt: releasedAt.toISOString(),
      reason: input.releaseReason,
    },
  });
}

export async function amendHoldScopeService(
  input: AmendHoldScopeInput,
  actor: HoldActor,
): Promise<LegalHold> {
  const before = await prisma.legalHold.findFirst({
    where: { id: input.holdId, organizationId: actor.organizationId },
  });
  if (!before) throw new Error(`Hold ${input.holdId} not found`);

  const updated = await prisma.legalHold.update({
    where: { id: input.holdId },
    data: { scopeDescription: input.newScopeDescription },
  });

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "SCOPE_AMENDED",
    summary: `Scope amended — ${input.reason}`,
    auditAction: "matter.legal_hold.scope_amended",
    beforeJson: { scopeDescription: before.scopeDescription },
    afterJson: { scopeDescription: input.newScopeDescription },
    metadata: { reason: input.reason },
  });

  return updated;
}
