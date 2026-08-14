/**
 * DSAR defensibility export (the "compliance & defensibility" benefit). A
 * self-contained JSON record of one request: the case metadata, the review
 * decisions with their AI-vs-human provenance, the assembled package, and the
 * verbatim chain-sealed AuditLog trail (chainPosition + contentHash) so an
 * off-database auditor can prove exactly who did what, when — and that the log
 * wasn't altered.
 */
import { prisma } from "@aegis/db";
import { getDsarDetail } from "./requests";
import { assembleResponsePackage } from "./delivery";
import { getDsarValidation, type DsarValidation } from "./validation";

export interface DsarDefensibilityExport {
  $schema: "aegis.privacy.dsar.defensibility.v1";
  generatedAt: string;
  request: unknown;
  reviewItems: Array<{ title: string; sourceSystem: string; aiVerdict: string | null; aiScore: number | null; reviewDecision: string; finalRelevant: boolean | null; redact: boolean }>;
  validation: DsarValidation;
  package: unknown;
  auditTrail: Array<{ chainPosition: number; action: string; actorType: string; actorId: string | null; at: string; contentHash: string }>;
}

export async function getDsarDefensibilityExport(organizationId: string, requestId: string): Promise<DsarDefensibilityExport> {
  const detail = await getDsarDetail(organizationId, requestId);
  if (!detail) throw new Error("Request not found");

  const [items, validation, pkg, audits] = await Promise.all([
    prisma.dSARReviewItem.findMany({ where: { requestId }, orderBy: [{ createdAt: "asc" }], select: { title: true, sourceSystem: true, aiVerdict: true, aiScore: true, reviewDecision: true, finalRelevant: true, redact: true } }),
    getDsarValidation(organizationId, requestId),
    assembleResponsePackage(organizationId, requestId).catch(() => null),
    prisma.auditLog.findMany({
      where: { organizationId, resourceType: "DataSubjectRequest", resourceId: requestId },
      orderBy: { chainPosition: "asc" },
      select: { chainPosition: true, action: true, actorType: true, actorId: true, timestamp: true, contentHash: true },
    }),
  ]);

  return {
    $schema: "aegis.privacy.dsar.defensibility.v1",
    generatedAt: new Date().toISOString(),
    request: detail,
    reviewItems: items.map((i) => ({ title: i.title, sourceSystem: i.sourceSystem, aiVerdict: i.aiVerdict, aiScore: i.aiScore, reviewDecision: i.reviewDecision, finalRelevant: i.finalRelevant, redact: i.redact })),
    validation,
    package: pkg,
    auditTrail: audits.map((a) => ({ chainPosition: Number(a.chainPosition), action: a.action, actorType: a.actorType, actorId: a.actorId, at: a.timestamp.toISOString(), contentHash: a.contentHash })),
  };
}
