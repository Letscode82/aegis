/**
 * Notice template management.
 *
 * Templates are content-hashed at write time so HoldNoticeIssuance
 * snapshots (templateVersion + bodyHashAtIssuance) detect any
 * subsequent edit. Editing a template bumps the version and
 * recomputes the hash; existing issuances retain the snapshot they
 * were issued under.
 */
import {
  bodyHash,
  prisma,
  type HoldNoticeIssuance,
  type HoldNoticeTemplate,
} from "@aegis/db";
import type {
  CreateNoticeTemplateInput,
  HoldActor,
  IssueNoticeInput,
  UpdateNoticeTemplateInput,
} from "../types";
import { recordHoldEvent } from "./timeline";

export async function createNoticeTemplateService(
  input: CreateNoticeTemplateInput,
  actor: HoldActor,
): Promise<HoldNoticeTemplate> {
  const hash = bodyHash(input.bodyMarkdown);
  return prisma.holdNoticeTemplate.create({
    data: {
      organizationId: actor.organizationId,
      name: input.name,
      jurisdictionKey: input.jurisdictionKey ?? null,
      bodyMarkdown: input.bodyMarkdown,
      bodyHash: hash,
      version: 1,
      isActive: true,
    },
  });
}

export async function updateNoticeTemplateService(
  input: UpdateNoticeTemplateInput,
  actor: HoldActor,
): Promise<HoldNoticeTemplate> {
  const existing = await prisma.holdNoticeTemplate.findFirst({
    where: { id: input.templateId, organizationId: actor.organizationId },
  });
  if (!existing) throw new Error(`Template ${input.templateId} not found`);

  if (existing.bodyMarkdown === input.bodyMarkdown) return existing;

  return prisma.holdNoticeTemplate.update({
    where: { id: input.templateId },
    data: {
      bodyMarkdown: input.bodyMarkdown,
      bodyHash: bodyHash(input.bodyMarkdown),
      version: existing.version + 1,
    },
  });
}

/** Returns a template best-matching the requested jurisdiction key. */
export async function pickTemplateForJurisdiction(
  organizationId: string,
  jurisdictionKey: string | null,
): Promise<HoldNoticeTemplate | null> {
  if (jurisdictionKey) {
    const exact = await prisma.holdNoticeTemplate.findFirst({
      where: { organizationId, jurisdictionKey, isActive: true },
      orderBy: [{ version: "desc" }],
    });
    if (exact) return exact;
  }
  return prisma.holdNoticeTemplate.findFirst({
    where: { organizationId, jurisdictionKey: null, isActive: true },
    orderBy: [{ version: "desc" }],
  });
}

/**
 * Standalone "issue this notice" — separate from issueLegalHoldService
 * (lifecycle.ts), which only fires once per hold transition. This
 * path is for re-issuing notice content (e.g. after a template
 * version bump) on an already-issued hold.
 */
export async function issueNoticeService(
  input: IssueNoticeInput,
  actor: HoldActor,
): Promise<HoldNoticeIssuance> {
  const hold = await prisma.legalHold.findFirst({
    where: { id: input.holdId, organizationId: actor.organizationId },
    include: { custodians: { select: { personId: true } } },
  });
  if (!hold) throw new Error(`Hold ${input.holdId} not found`);

  const tpl = await prisma.holdNoticeTemplate.findFirst({
    where: {
      id: input.templateId,
      organizationId: actor.organizationId,
      isActive: true,
    },
  });
  if (!tpl) throw new Error(`Template ${input.templateId} not found / inactive`);

  const recipientCount =
    input.recipientCustodianPersonIds?.length ?? hold.custodians.length;

  const issuance = await prisma.holdNoticeIssuance.create({
    data: {
      legalHoldId: hold.id,
      templateId: tpl.id,
      templateVersion: tpl.version,
      bodyHashAtIssuance: tpl.bodyHash,
      recipientCount,
      issuedById: actor.id,
    },
  });

  await recordHoldEvent({
    legalHoldId: hold.id,
    organizationId: actor.organizationId,
    actor,
    type: "REMINDER_SENT",
    summary: `Notice (re-)issued — ${recipientCount} recipients`,
    auditAction: "matter.legal_hold.notice.issued",
    afterJson: {
      issuanceId: issuance.id,
      templateId: tpl.id,
      templateVersion: tpl.version,
      bodyHashAtIssuance: tpl.bodyHash,
      recipientCount,
    },
  });

  return issuance;
}
