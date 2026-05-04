/**
 * Hold defensibility scorecard — deterministic in 4b.
 *
 * Six components, weighted, summed to a 0..100 score. AI narrative
 * (D6) ships in 4d as an additional `narrativeMarkdown` field; the
 * structured shape here stays unchanged.
 *
 * Components and weights:
 *   custodianAcknowledgmentRate    25
 *   reAttestationCurrency          15
 *   dataSourcePreservationCoverage 20
 *   itPreservationConfirmationRate 20
 *   noticeTemplateIntegrity        10
 *   auditChainIntegrity            10
 *
 * The integrity components are 100% in 4b's seeded data — chain
 * triggers are intact, template hashes are preserved at issuance —
 * so the scorecard test surface is the four operational components.
 */
import { prisma, verifyAuditChain } from "@aegis/db";
import type {
  HoldDefensibilityGap,
  HoldDefensibilityScore,
  ScoreComponent,
} from "../types";

const WEIGHTS = {
  custodianAcknowledgmentRate: 25,
  reAttestationCurrency: 15,
  dataSourcePreservationCoverage: 20,
  itPreservationConfirmationRate: 20,
  noticeTemplateIntegrity: 10,
  auditChainIntegrity: 10,
} as const;

/**
 * Compute a numerator/denominator ratio in [0, 1] OR return null
 * when the denominator is zero — a null component is excluded from
 * the weighted score (rather than reporting a misleading 100%).
 */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.max(0, Math.min(1, numerator / denominator));
}

/**
 * Aggregate per-component scores into a single 0..100 number.
 * Null components are excluded from BOTH the weighted sum and the
 * divisor, so the overall reflects only what's currently
 * measurable. When every component is null the result is 0 —
 * but the hold is so empty that no meaningful score exists.
 */
export function computeWeightedScore(
  components: Array<{ value: number | null; weight: number }>,
): number {
  const applicable = components.filter(
    (c): c is { value: number; weight: number } => c.value !== null,
  );
  const totalWeight = applicable.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = applicable.reduce((s, c) => s + c.value * c.weight, 0);
  return Math.round((weightedSum / totalWeight) * 100);
}

export async function getHoldDefensibilityScoreService(
  holdId: string,
): Promise<HoldDefensibilityScore> {
  const hold = await prisma.legalHold.findUnique({
    where: { id: holdId },
    include: {
      custodians: {
        include: {
          dataSources: true,
        },
      },
      noticeIssuances: {
        include: { template: true },
      },
    },
  });
  if (!hold) throw new Error(`Hold ${holdId} not found`);

  const now = Date.now();
  const gaps: HoldDefensibilityGap[] = [];

  // Component 1 — custodian acknowledgment rate. Inapplicable when
  // the hold has no custodians yet (DRAFT with empty roster).
  const totalCustodians = hold.custodians.length;
  const acknowledged = hold.custodians.filter((c) => c.acknowledgedAt).length;
  const ackRate = ratio(acknowledged, totalCustodians);
  if (totalCustodians > 0 && acknowledged < totalCustodians) {
    gaps.push({
      key: "custodian-acknowledgment-pending",
      severity: "high",
      message: `${totalCustodians - acknowledged} of ${totalCustodians} custodians have not yet acknowledged the hold.`,
      count: totalCustodians - acknowledged,
    });
  }

  // Component 2 — re-attestation currency. Inapplicable until at
  // least one custodian has acknowledged (no nextReAttestationDueAt
  // is ever set before that).
  const ackedCustodians = hold.custodians.filter((c) => c.acknowledgedAt);
  const overdueCustodians = ackedCustodians.filter(
    (c) =>
      !c.releasedAt &&
      c.nextReAttestationDueAt !== null &&
      c.nextReAttestationDueAt.getTime() < now,
  );
  const reAttestRate = ratio(
    Math.max(0, ackedCustodians.length - overdueCustodians.length),
    ackedCustodians.length,
  );
  if (overdueCustodians.length > 0) {
    gaps.push({
      key: "re-attestation-overdue",
      severity: "medium",
      message: `${overdueCustodians.length} custodian${overdueCustodians.length === 1 ? "" : "s"} overdue for re-attestation.`,
      count: overdueCustodians.length,
    });
  }

  // Component 3 — data source preservation coverage. Inapplicable
  // when no data sources have been mapped yet.
  const allDataSources = hold.custodians.flatMap((c) => c.dataSources);
  const totalDataSources = allDataSources.length;
  const successfullyApplied = allDataSources.filter(
    (d) =>
      d.preservationAppliedAt !== null &&
      d.preservationAction !== "PRESERVATION_FAILED" &&
      d.preservationAction !== "NOT_APPLICABLE",
  ).length;
  const dsCoverage = ratio(successfullyApplied, totalDataSources);
  const notApplied = totalDataSources - successfullyApplied;
  if (totalDataSources > 0 && notApplied > 0) {
    gaps.push({
      key: "data-source-preservation-not-applied",
      severity: "high",
      message: `${notApplied} data source${notApplied === 1 ? "" : "s"} without successful preservation.`,
      count: notApplied,
    });
  }
  const conflictCount = allDataSources.filter(
    (d) => d.retentionPolicyConflict,
  ).length;
  if (conflictCount > 0) {
    gaps.push({
      key: "retention-policy-conflict",
      severity: "high",
      message: `${conflictCount} data source${conflictCount === 1 ? "" : "s"} flagged with a retention-policy conflict (ephemeral/auto-delete).`,
      count: conflictCount,
    });
  }

  // Component 4 — IT preservation confirmation rate. Inapplicable
  // when no data sources have been mapped, OR when none have been
  // applied yet (you can't confirm what hasn't been applied).
  const confirmedCount = allDataSources.filter(
    (d) => d.preservationConfirmedAt !== null,
  ).length;
  const itConfirmRate = ratio(confirmedCount, successfullyApplied);
  if (
    totalDataSources > 0 &&
    successfullyApplied > 0 &&
    confirmedCount < successfullyApplied
  ) {
    gaps.push({
      key: "data-source-preservation-not-confirmed",
      severity: "medium",
      message: `${successfullyApplied - confirmedCount} data source${successfullyApplied - confirmedCount === 1 ? "" : "s"} await IT-side preservation confirmation.`,
      count: successfullyApplied - confirmedCount,
    });
  }

  // Component 5 — notice template integrity. Inapplicable until at
  // least one notice has been issued.
  let templateOk = 0;
  let templateTotal = 0;
  for (const iss of hold.noticeIssuances) {
    templateTotal += 1;
    if (iss.bodyHashAtIssuance) {
      // Drift means the issuance hash is empty (writer bypassed the
      // snapshot path) — the template's *current* hash may legally
      // advance after the issuance.
      templateOk += 1;
    }
  }
  const templateRate = ratio(templateOk, templateTotal);
  if (templateTotal > templateOk) {
    gaps.push({
      key: "notice-template-drift",
      severity: "high",
      message: `${templateTotal - templateOk} notice issuance${templateTotal - templateOk === 1 ? "" : "s"} missing a content-hash snapshot.`,
      count: templateTotal - templateOk,
    });
  }

  // Component 6 — audit chain integrity for the org. Always
  // applicable — chain seal is non-negotiable.
  const chainResult = await verifyAuditChain(hold.organizationId);
  const chainRate = chainResult.intact ? 1 : 0;
  if (!chainResult.intact) {
    gaps.push({
      key: "audit-chain-break",
      severity: "high",
      message: `${chainResult.breaks.length} chain break${chainResult.breaks.length === 1 ? "" : "s"} detected in the organisation audit ledger.`,
      count: chainResult.breaks.length,
    });
  }

  const components: HoldDefensibilityScore["components"] = {
    custodianAcknowledgmentRate: makeComponent(
      ackRate,
      WEIGHTS.custodianAcknowledgmentRate,
      ackRate === null
        ? null
        : acknowledged === totalCustodians
          ? null
          : `${acknowledged}/${totalCustodians} acknowledged`,
      ackRate === null ? "No custodians on this hold yet." : null,
    ),
    reAttestationCurrency: makeComponent(
      reAttestRate,
      WEIGHTS.reAttestationCurrency,
      reAttestRate === null
        ? null
        : overdueCustodians.length === 0
          ? null
          : `${overdueCustodians.length} overdue`,
      reAttestRate === null
        ? "Not yet applicable — no custodians have acknowledged yet."
        : null,
    ),
    dataSourcePreservationCoverage: makeComponent(
      dsCoverage,
      WEIGHTS.dataSourcePreservationCoverage,
      dsCoverage === null
        ? null
        : notApplied === 0
          ? null
          : `${notApplied} sources unprotected`,
      dsCoverage === null
        ? "Not yet applicable — no data sources mapped yet."
        : null,
    ),
    itPreservationConfirmationRate: makeComponent(
      itConfirmRate,
      WEIGHTS.itPreservationConfirmationRate,
      itConfirmRate === null
        ? null
        : confirmedCount === successfullyApplied
          ? null
          : `${successfullyApplied - confirmedCount} confirmations pending`,
      itConfirmRate === null
        ? totalDataSources === 0
          ? "Not yet applicable — no data sources mapped yet."
          : "Not yet applicable — no preservation has been applied yet."
        : null,
    ),
    noticeTemplateIntegrity: makeComponent(
      templateRate,
      WEIGHTS.noticeTemplateIntegrity,
      templateRate === null
        ? null
        : templateOk === templateTotal
          ? null
          : `${templateTotal - templateOk} issuances missing snapshot`,
      templateRate === null
        ? "Not yet applicable — no notices have been issued yet."
        : null,
    ),
    auditChainIntegrity: makeComponent(
      chainRate,
      WEIGHTS.auditChainIntegrity,
      chainResult.intact ? null : `${chainResult.breaks.length} chain breaks`,
      null,
    ),
  };

  const score = computeWeightedScore(Object.values(components));

  return {
    holdId,
    computedAt: new Date().toISOString(),
    score,
    components,
    gaps,
  };
}

function makeComponent(
  value: number | null,
  weight: number,
  gap: string | null,
  notApplicableReason: string | null,
): ScoreComponent {
  return { value, weight, gap, notApplicableReason };
}
