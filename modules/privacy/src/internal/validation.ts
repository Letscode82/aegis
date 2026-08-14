/**
 * DSAR review validation — how well the AI relevance pass matched the human
 * decisions on this request. Each validated review item is a coded item:
 * the AI predicted RELEVANT (or not); the human's CONFIRM/OVERRIDE set the
 * authoritative `finalRelevant`. `@aegis/validation` turns that into recall /
 * precision (with Wilson CIs) + an overturn rate — the defensibility numbers
 * that show the AI was checked, not trusted. Full census (every validated
 * item), so no sampling is needed for DSAR.
 */
import { prisma } from "@aegis/db";
import { recallPrecision, overturnRate, type CodedItem, type ValidationMetrics, type OverturnResult } from "@aegis/validation";

export interface DsarValidation {
  coded: number;
  pending: number;
  metrics: ValidationMetrics;
  overturn: OverturnResult;
}

export async function getDsarValidation(organizationId: string, requestId: string): Promise<DsarValidation> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, select: { id: true } });
  if (!req) throw new Error("Request not found");

  const items = await prisma.dSARReviewItem.findMany({
    where: { requestId },
    select: { aiVerdict: true, reviewDecision: true, finalRelevant: true },
  });

  // Only items the AI scored AND a human validated can be compared.
  const coded: CodedItem[] = items
    .filter((i) => i.aiVerdict != null && i.reviewDecision !== "PENDING")
    .map((i) => ({ predictedPositive: i.aiVerdict === "RELEVANT", actualPositive: i.finalRelevant === true }));

  const pending = items.filter((i) => i.reviewDecision === "PENDING").length;

  return {
    coded: coded.length,
    pending,
    metrics: recallPrecision(coded),
    overturn: overturnRate(coded),
  };
}
