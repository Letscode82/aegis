/**
 * Custodian lifecycle on a hold — add, remove, acknowledge,
 * re-attest, mark-departed.
 */
import { prisma, type LegalHoldCustodian } from "@aegis/db";
import type {
  AcknowledgeHoldInput,
  AddHoldCustodianInput,
  HoldActor,
  ReAttestHoldInput,
} from "../types";
import { effectiveCadenceDays, resolveEffectivePolicy } from "./policy";
import { recordHoldEvent } from "./timeline";

export class CustodianAlreadyAcknowledgedError extends Error {
  constructor(personId: string) {
    super(`Custodian ${personId} has already acknowledged this hold.`);
    this.name = "CustodianAlreadyAcknowledgedError";
  }
}

export async function addHoldCustodianService(
  input: AddHoldCustodianInput,
  actor: HoldActor,
): Promise<LegalHoldCustodian> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: input.holdId, organizationId: actor.organizationId },
    select: { id: true, jurisdictions: true },
  });
  if (!hold) throw new Error(`Hold ${input.holdId} not found`);

  const policy = await resolveEffectivePolicy(actor.organizationId, hold.id);
  const cadenceDays = effectiveCadenceDays(policy, hold.jurisdictions);
  const dueDate = new Date(Date.now() + cadenceDays * 24 * 60 * 60 * 1000);

  const created = await prisma.legalHoldCustodian.upsert({
    where: {
      legalHoldId_personId: {
        legalHoldId: input.holdId,
        personId: input.personId,
      },
    },
    update: {},
    create: {
      legalHoldId: input.holdId,
      personId: input.personId,
      nextReAttestationDueAt: dueDate,
    },
  });

  // Optional initial data sources.
  if (input.initialDataSources?.length) {
    for (const ds of input.initialDataSources) {
      await prisma.custodianDataSource.create({
        data: {
          legalHoldCustodianId: created.id,
          type: ds.type,
          externalIdentifier: ds.externalIdentifier,
          displayLabel: ds.displayLabel,
          preservationAction: ds.preservationAction ?? "LEGAL_HOLD_IN_PLACE",
        },
      });
    }
  }

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_ADDED",
    summary: `Custodian ${input.personId} added to hold`,
    auditAction: "matter.legal_hold.custodian.added",
    afterJson: { personId: input.personId, custodianId: created.id },
    metadata: {
      cadenceDays,
      initialDataSourceCount: input.initialDataSources?.length ?? 0,
    },
  });

  return created;
}

export async function removeHoldCustodianService(
  holdId: string,
  personId: string,
  actor: HoldActor,
): Promise<void> {
  const existing = await prisma.legalHoldCustodian.findUnique({
    where: { legalHoldId_personId: { legalHoldId: holdId, personId } },
  });
  if (!existing) return;

  await prisma.legalHoldCustodian.delete({ where: { id: existing.id } });

  await recordHoldEvent({
    legalHoldId: holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_REMOVED",
    summary: `Custodian ${personId} removed from hold`,
    auditAction: "matter.legal_hold.custodian.removed",
    beforeJson: { personId, custodianId: existing.id },
  });
}

export async function acknowledgeHoldService(
  input: AcknowledgeHoldInput,
  actor: HoldActor,
): Promise<LegalHoldCustodian> {
  const row = await prisma.legalHoldCustodian.findUnique({
    where: {
      legalHoldId_personId: {
        legalHoldId: input.holdId,
        personId: input.personId,
      },
    },
  });
  if (!row) throw new Error(`Custodian row not found`);
  if (row.acknowledgedAt) {
    throw new CustodianAlreadyAcknowledgedError(input.personId);
  }

  const acknowledgedAt = new Date();
  const updated = await prisma.legalHoldCustodian.update({
    where: { id: row.id },
    data: {
      acknowledgedAt,
      acknowledgmentMetadata: {
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        attestationStatement: input.attestationStatement ?? null,
      },
      lastReAttestedAt: acknowledgedAt,
    },
  });

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_ACKNOWLEDGED",
    summary: `Custodian ${input.personId} acknowledged the hold`,
    auditAction: "matter.legal_hold.custodian.acknowledged",
    afterJson: {
      personId: input.personId,
      acknowledgedAt: acknowledgedAt.toISOString(),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  // Promote the hold to ACTIVE if everyone has acknowledged + it's
  // currently still ISSUED.
  const hold = await prisma.legalHold.findUnique({
    where: { id: input.holdId },
    select: { status: true, custodians: { select: { acknowledgedAt: true } } },
  });
  if (
    hold &&
    hold.status === "ISSUED" &&
    hold.custodians.every((c) => c.acknowledgedAt !== null)
  ) {
    await prisma.legalHold.update({
      where: { id: input.holdId },
      data: { status: "ACTIVE" },
    });
  }

  return updated;
}

export async function reAttestHoldService(
  input: ReAttestHoldInput,
  actor: HoldActor,
): Promise<LegalHoldCustodian> {
  const row = await prisma.legalHoldCustodian.findUnique({
    where: {
      legalHoldId_personId: {
        legalHoldId: input.holdId,
        personId: input.personId,
      },
    },
  });
  if (!row) throw new Error("Custodian row not found");

  const hold = await prisma.legalHold.findUnique({
    where: { id: input.holdId },
    select: { jurisdictions: true, organizationId: true },
  });
  if (!hold) throw new Error("Hold not found");

  const policy = await resolveEffectivePolicy(hold.organizationId, input.holdId);
  const cadenceDays = effectiveCadenceDays(policy, hold.jurisdictions);
  const reAttestedAt = new Date();
  const nextDue = new Date(reAttestedAt.getTime() + cadenceDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.legalHoldCustodian.update({
    where: { id: row.id },
    data: {
      lastReAttestedAt: reAttestedAt,
      nextReAttestationDueAt: nextDue,
    },
  });

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_RE_ATTESTED",
    summary: `Custodian ${input.personId} re-attested`,
    auditAction: "matter.legal_hold.custodian.re_attested",
    afterJson: {
      personId: input.personId,
      reAttestedAt: reAttestedAt.toISOString(),
      nextDueAt: nextDue.toISOString(),
    },
    metadata: { cadenceDays },
  });

  return updated;
}

export async function markCustodianDepartedService(
  holdId: string,
  personId: string,
  actor: HoldActor,
  notes?: string,
): Promise<void> {
  const row = await prisma.legalHoldCustodian.findUnique({
    where: { legalHoldId_personId: { legalHoldId: holdId, personId } },
  });
  if (!row) throw new Error("Custodian row not found");

  const retention = await prisma.departedCustodianRetention.create({
    data: {
      organizationId: actor.organizationId,
      personId,
      legalHoldId: holdId,
      preservationStatus: "THIRD_PARTY_COLLECTION_PENDING",
      notes: notes ?? null,
    },
  });

  await prisma.legalHoldCustodian.update({
    where: { id: row.id },
    data: {
      departureRecordedAt: new Date(),
      departedCustodianRetentionId: retention.id,
    },
  });

  // Hold gains the affectsDepartedCustodians flag if not already.
  await prisma.legalHold.updateMany({
    where: { id: holdId, affectsDepartedCustodians: false },
    data: { affectsDepartedCustodians: true },
  });

  await recordHoldEvent({
    legalHoldId: holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_DEPARTED",
    summary: `Custodian ${personId} departed — retention queued`,
    auditAction: "matter.legal_hold.custodian.departed",
    afterJson: { personId, retentionId: retention.id, notes: notes ?? null },
  });
}
