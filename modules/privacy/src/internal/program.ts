/**
 * Privacy program summary (module #10) — the Overview KPI roll-up across
 * every privacy surface: DSAR, assessments, RoPA, incidents, consent. Pure
 * read aggregation over existing tables; no new table. Gated like the other
 * privacy reads.
 */
import { prisma } from "@aegis/db";

const OPEN_DSAR = ["RECEIVED", "VERIFYING", "IN_PROGRESS", "AWAITING_REVIEW"] as const;
const BREACH_MS = 72 * 3_600_000;

export interface PrivacyProgramSummary {
  dsar: { total: number; open: number };
  assessments: { total: number; inReview: number; highRisk: number; dpiaRequired: number };
  ropa: { activities: number };
  incidents: { total: number; open: number; breaching: number };
  consent: { active: number; withdrawn: number };
}

export async function getPrivacyProgramSummary(organizationId: string): Promise<PrivacyProgramSummary> {
  const now = Date.now();
  const [
    dsarTotal, dsarOpen,
    assessTotal, assessInReview, assessHigh, assessSevere, assessDpia,
    ropaCount,
    incidents,
    consentActive, consentWithdrawn,
  ] = await Promise.all([
    prisma.dataSubjectRequest.count({ where: { organizationId } }),
    prisma.dataSubjectRequest.count({ where: { organizationId, status: { in: OPEN_DSAR as never } } }),
    prisma.privacyAssessment.count({ where: { organizationId } }),
    prisma.privacyAssessment.count({ where: { organizationId, status: "IN_REVIEW" } }),
    prisma.privacyAssessment.count({ where: { organizationId, riskLevel: "HIGH" } }),
    prisma.privacyAssessment.count({ where: { organizationId, riskLevel: "SEVERE" } }),
    prisma.privacyAssessment.count({ where: { organizationId, dpiaRequired: true } }),
    prisma.dataProcessingActivity.count({ where: { organizationId } }),
    prisma.privacyIncident.findMany({ where: { organizationId }, select: { status: true, discoveredAt: true, regulatorNotified: true } }),
    prisma.consentRecord.count({ where: { organizationId, withdrawnAt: null } }),
    prisma.consentRecord.count({ where: { organizationId, withdrawnAt: { not: null } } }),
  ]);

  const incOpen = incidents.filter((i) => i.status !== "RESOLVED").length;
  const incBreaching = incidents.filter((i) => !i.regulatorNotified && now > i.discoveredAt.getTime() + BREACH_MS).length;

  return {
    dsar: { total: dsarTotal, open: dsarOpen },
    assessments: { total: assessTotal, inReview: assessInReview, highRisk: assessHigh + assessSevere, dpiaRequired: assessDpia },
    ropa: { activities: ropaCount },
    incidents: { total: incidents.length, open: incOpen, breaching: incBreaching },
    consent: { active: consentActive, withdrawn: consentWithdrawn },
  };
}
