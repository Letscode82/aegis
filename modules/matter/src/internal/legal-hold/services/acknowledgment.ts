/**
 * Admin-on-behalf acknowledgment (sub-PR 4c.3, Item 2).
 *
 * Two acknowledgment paths exist post-4c.3:
 *
 *   1. Custodian self-service — `acknowledgeHoldService` in
 *      `custodians.ts`. Driven from the
 *      `/custodian/holds/[holdId]/acknowledge` page (4b).
 *      `acknowledgmentMetadata.source` is implicit-direct (no
 *      `source` key).
 *
 *   2. Admin-on-behalf — this file. Used when a custodian
 *      acknowledges over the phone, in person, via paper, etc.,
 *      and legal ops needs to record the ack with provenance.
 *      `acknowledgmentMetadata.source = "admin_marked"` plus a
 *      reason string that travels into the chain-sealed audit row
 *      so a later reviewer can reconstruct the off-line context.
 *
 * Both paths flip the same `acknowledgedAt` field — the
 * defensibility scorecard counts this row identically, but the
 * timeline + AuditLog distinguish them via metadata.
 */
import { prisma, type LegalHoldCustodian } from "@aegis/db";
import { CustodianAlreadyAcknowledgedError } from "./custodians";
import { recordHoldEvent } from "./timeline";
import type { HoldActor } from "../types";

export interface MarkAcknowledgedInput {
  holdId: string;
  personId: string;
  /** Free-text reason — e.g. "Acknowledged over phone with Marcus." */
  reason: string;
  /** Optional witness/signature record. */
  witness?: string;
  /** Captured for provenance even though admin is the actor. */
  ip?: string;
  userAgent?: string;
}

export async function markCustodianAcknowledgedByAdminService(
  input: MarkAcknowledgedInput,
  actor: HoldActor,
): Promise<LegalHoldCustodian> {
  if (!input.reason || input.reason.trim().length === 0) {
    throw new Error("reason is required for admin-on-behalf acknowledgment");
  }

  const row = await prisma.legalHoldCustodian.findUnique({
    where: {
      legalHoldId_personId: {
        legalHoldId: input.holdId,
        personId: input.personId,
      },
    },
    include: { legalHold: { select: { organizationId: true } } },
  });
  if (!row) throw new Error("Custodian row not found");
  if (row.legalHold.organizationId !== actor.organizationId) {
    throw new Error("Cross-org access refused");
  }
  if (row.acknowledgedAt) {
    throw new CustodianAlreadyAcknowledgedError(input.personId);
  }

  const acknowledgedAt = new Date();
  const metadata = {
    source: "admin_marked" as const,
    reason: input.reason.trim(),
    witness: input.witness?.trim() || null,
    acknowledgedByAdminId: actor.id,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  };

  const updated = await prisma.legalHoldCustodian.update({
    where: { id: row.id },
    data: {
      acknowledgedAt,
      acknowledgmentMetadata: metadata,
      lastReAttestedAt: acknowledgedAt,
    },
  });

  await recordHoldEvent({
    legalHoldId: input.holdId,
    organizationId: actor.organizationId,
    actor,
    type: "CUSTODIAN_ACKNOWLEDGED",
    summary: `Acknowledged on behalf of custodian ${input.personId} (admin-marked)`,
    auditAction: "matter.legal_hold.custodian.acknowledged_by_admin",
    afterJson: {
      personId: input.personId,
      acknowledgedAt: acknowledgedAt.toISOString(),
      onBehalfOf: input.personId,
      metadata,
    },
  });

  // Same DRAFT/ISSUED → ACTIVE auto-promotion as the
  // self-service path: if everyone has now acknowledged, promote.
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
