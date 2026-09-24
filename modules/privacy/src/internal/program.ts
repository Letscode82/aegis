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

/**
 * Program-wide defensibility export (privacy hardening). A pure builder that
 * turns the program summary into a self-contained, deterministic compliance
 * report: section rollups, a human-readable attention list, and a 0-100
 * posture score. Pure (no DB) so it is fully unit-testable; the route pairs
 * it with getPrivacyProgramSummary.
 */
export interface PrivacyProgramExport {
  $schema: "aegis.privacy.program.defensibility.v1";
  generatedAt: string;
  organization: string;
  summary: PrivacyProgramSummary;
  posture: {
    score: number;
    openTotal: number;
    attentionItems: string[];
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildPrivacyProgramExport(
  summary: PrivacyProgramSummary,
  meta: { organization: string; generatedAt?: string },
): PrivacyProgramExport {
  const attentionItems: string[] = [];
  // Ordered most-urgent first.
  if (summary.incidents.breaching > 0)
    attentionItems.push(`${plural(summary.incidents.breaching, "incident")} past the 72-hour regulator-notification clock`);
  if (summary.assessments.highRisk > 0)
    attentionItems.push(`${plural(summary.assessments.highRisk, "high-risk assessment")} outstanding`);
  if (summary.dsar.open > 0)
    attentionItems.push(`${plural(summary.dsar.open, "DSAR")} open`);
  if (summary.assessments.inReview > 0)
    attentionItems.push(`${plural(summary.assessments.inReview, "assessment")} awaiting review`);
  if (summary.incidents.open > 0)
    attentionItems.push(`${plural(summary.incidents.open, "privacy incident")} open`);

  // Deterministic 0-100 posture: start clean, subtract weighted penalties.
  let score = 100;
  score -= summary.incidents.breaching * 25; // breach clock is the heaviest
  score -= summary.assessments.highRisk * 8;
  score -= summary.dsar.open * 4;
  score -= summary.incidents.open * 3;
  score -= summary.assessments.inReview * 2;
  score = Math.max(0, Math.min(100, score));

  const openTotal = summary.dsar.open + summary.assessments.inReview + summary.incidents.open;

  return {
    $schema: "aegis.privacy.program.defensibility.v1",
    generatedAt: meta.generatedAt || new Date().toISOString(),
    organization: meta.organization,
    summary,
    posture: { score, openTotal, attentionItems },
  };
}
