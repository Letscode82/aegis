/**
 * Read-model queries for the legal-hold sub-domain. Pure-fetch
 * helpers that the API routes and UI components compose against.
 */
import { prisma, type LegalHold, type LegalHoldEvent } from "@aegis/db";
import type { CustodianHoldView } from "../types";
import { effectiveCadenceForHold } from "./reminders";

export async function listLegalHoldsService(
  organizationId: string,
  matterId?: string,
): Promise<LegalHold[]> {
  return prisma.legalHold.findMany({
    where: {
      organizationId,
      ...(matterId && { matterId }),
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function getLegalHoldByIdService(
  holdId: string,
): Promise<LegalHold | null> {
  return prisma.legalHold.findUnique({ where: { id: holdId } });
}

export async function listHoldEventsService(
  holdId: string,
  limit = 200,
): Promise<LegalHoldEvent[]> {
  return prisma.legalHoldEvent.findMany({
    where: { legalHoldId: holdId },
    orderBy: [{ occurredAt: "desc" }],
    take: limit,
  });
}

export async function getCustodianHoldViewService(
  holdId: string,
  personId: string,
): Promise<CustodianHoldView | null> {
  const hold = await prisma.legalHold.findUnique({ where: { id: holdId } });
  if (!hold) return null;
  const custodianRow = await prisma.legalHoldCustodian.findUnique({
    where: { legalHoldId_personId: { legalHoldId: holdId, personId } },
    include: { dataSources: true },
  });
  if (!custodianRow) return null;

  const issuance = await prisma.holdNoticeIssuance.findFirst({
    where: { legalHoldId: holdId },
    include: { template: true },
    orderBy: [{ issuedAt: "desc" }],
  });
  const noticeBodyMarkdown = issuance?.template.bodyMarkdown ?? "(no notice issued yet)";
  const templateName = issuance?.template.name ?? "(none)";
  const templateBodyHash = issuance?.bodyHashAtIssuance ?? "";

  return {
    hold,
    custodianRow,
    noticeBodyMarkdown,
    templateName,
    templateBodyHash,
    dataSources: custodianRow.dataSources,
  };
}

/**
 * Workspace-summary read for the 4c.2 single-page hold workspace.
 *
 * Returns the hold plus pre-computed counts so the
 * `HoldDetailPage` doesn't have to re-walk custodians + sources
 * client-side just to render the status row. Single round-trip.
 */
export interface HoldWorkspaceSummary {
  hold: LegalHold;
  counts: {
    custodians: number;
    custodiansAcknowledged: number;
    custodiansPending: number;
    custodiansOverdue: number;
    custodiansReleased: number;
    custodiansDeparted: number;
    dataSources: number;
    dataSourcesPreserved: number;
    dataSourcesItConfirmed: number;
    dataSourcesConflict: number;
    notices: number;
    events: number;
  };
  lastActivityAt: string | null;
  nextReminderDueAt: string | null;
  cadenceDays: number;
}

export async function getHoldWorkspaceSummaryService(
  holdId: string,
): Promise<HoldWorkspaceSummary | null> {
  const hold = await prisma.legalHold.findUnique({
    where: { id: holdId },
    include: {
      custodians: { include: { dataSources: true } },
      _count: { select: { noticeIssuances: true, events: true } },
    },
  });
  if (!hold) return null;

  const now = Date.now();
  const counts = {
    custodians: hold.custodians.length,
    custodiansAcknowledged: 0,
    custodiansPending: 0,
    custodiansOverdue: 0,
    custodiansReleased: 0,
    custodiansDeparted: 0,
    dataSources: 0,
    dataSourcesPreserved: 0,
    dataSourcesItConfirmed: 0,
    dataSourcesConflict: 0,
    notices: hold._count.noticeIssuances,
    events: hold._count.events,
  };

  let lastActivityAt: number | null = null;

  for (const c of hold.custodians) {
    if (c.releasedAt) counts.custodiansReleased += 1;
    else if (c.acknowledgedAt) counts.custodiansAcknowledged += 1;
    else counts.custodiansPending += 1;

    if (c.departureRecordedAt) counts.custodiansDeparted += 1;

    if (
      !c.releasedAt &&
      c.nextReAttestationDueAt &&
      c.nextReAttestationDueAt.getTime() < now
    ) {
      counts.custodiansOverdue += 1;
    }

    for (const d of c.dataSources) {
      counts.dataSources += 1;
      if (
        d.preservationAppliedAt &&
        d.preservationAction !== "PRESERVATION_FAILED" &&
        d.preservationAction !== "NOT_APPLICABLE"
      ) {
        counts.dataSourcesPreserved += 1;
      }
      if (d.preservationConfirmedAt) counts.dataSourcesItConfirmed += 1;
      if (d.retentionPolicyConflict) counts.dataSourcesConflict += 1;

      const ts = (d.preservationConfirmedAt ?? d.preservationAppliedAt)?.getTime();
      if (ts && (lastActivityAt === null || ts > lastActivityAt)) {
        lastActivityAt = ts;
      }
    }

    const cTs =
      (c.lastReAttestedAt ?? c.acknowledgedAt ?? c.releasedAt)?.getTime();
    if (cTs && (lastActivityAt === null || cTs > lastActivityAt)) {
      lastActivityAt = cTs;
    }
  }

  // The latest LegalHoldEvent timestamp wins if it's newer than any
  // per-custodian / per-source signal.
  const lastEvent = await prisma.legalHoldEvent.findFirst({
    where: { legalHoldId: holdId },
    orderBy: [{ occurredAt: "desc" }],
    select: { occurredAt: true },
  });
  if (lastEvent) {
    const evTs = lastEvent.occurredAt.getTime();
    if (lastActivityAt === null || evTs > lastActivityAt) {
      lastActivityAt = evTs;
    }
  }

  // Soonest re-attestation due across all active custodians.
  let nextDue: number | null = null;
  for (const c of hold.custodians) {
    if (c.releasedAt || !c.nextReAttestationDueAt) continue;
    const t = c.nextReAttestationDueAt.getTime();
    if (nextDue === null || t < nextDue) nextDue = t;
  }

  const cadenceDays = await effectiveCadenceForHold(
    hold.organizationId,
    holdId,
  );

  return {
    hold,
    counts,
    lastActivityAt: lastActivityAt ? new Date(lastActivityAt).toISOString() : null,
    nextReminderDueAt: nextDue ? new Date(nextDue).toISOString() : null,
    cadenceDays,
  };
}
