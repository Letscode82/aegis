/**
 * Read-model queries for the legal-hold sub-domain. Pure-fetch
 * helpers that the API routes and UI components compose against.
 */
import { prisma, type LegalHold, type LegalHoldEvent } from "@aegis/db";
import type { CustodianHoldView } from "../types";

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
