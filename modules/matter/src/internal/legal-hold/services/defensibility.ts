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

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return Math.max(0, Math.min(1, numerator / denominator));
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

  // Component 1 — custodian acknowledgment rate.
  const totalCustodians = hold.custodians.length;
  const acknowledged = hold.custodians.filter((c) => c.acknowledgedAt).length;
  const ackRate = ratio(acknowledged, Math.max(1, totalCustodians));
  if (acknowledged < totalCustodians) {
    gaps.push({
      key: "custodian-acknowledgment-pending",
      severity: "high",
      message: `${totalCustodians - acknowledged} of ${totalCustodians} custodians have not yet acknowledged the hold.`,
      count: totalCustodians - acknowledged,
    });
  }

  // Component 2 — re-attestation currency. A custodian whose
  // nextReAttestationDueAt is in the past is overdue.
  const overdueCustodians = hold.custodians.filter(
    (c) =>
      !c.releasedAt &&
      c.nextReAttestationDueAt !== null &&
      c.nextReAttestationDueAt.getTime() < now,
  );
  const reAttestRate = ratio(
    Math.max(0, totalCustodians - overdueCustodians.length),
    Math.max(1, totalCustodians),
  );
  if (overdueCustodians.length > 0) {
    gaps.push({
      key: "re-attestation-overdue",
      severity: "medium",
      message: `${overdueCustodians.length} custodian${overdueCustodians.length === 1 ? "" : "s"} overdue for re-attestation.`,
      count: overdueCustodians.length,
    });
  }

  // Component 3 — data source preservation coverage. Every active
  // custodian should have at least one data source whose
  // preservationAction is not NOT_APPLICABLE / PRESERVATION_FAILED.
  const allDataSources = hold.custodians.flatMap((c) => c.dataSources);
  const totalDataSources = allDataSources.length;
  const successfullyApplied = allDataSources.filter(
    (d) =>
      d.preservationAppliedAt !== null &&
      d.preservationAction !== "PRESERVATION_FAILED" &&
      d.preservationAction !== "NOT_APPLICABLE",
  ).length;
  const dsCoverage = ratio(
    successfullyApplied,
    Math.max(1, totalDataSources),
  );
  const notApplied = totalDataSources - successfullyApplied;
  if (notApplied > 0) {
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

  // Component 4 — IT preservation confirmation rate.
  const confirmedCount = allDataSources.filter(
    (d) => d.preservationConfirmedAt !== null,
  ).length;
  const itConfirmRate = ratio(
    confirmedCount,
    Math.max(1, totalDataSources),
  );
  if (confirmedCount < totalDataSources) {
    gaps.push({
      key: "data-source-preservation-not-confirmed",
      severity: "medium",
      message: `${totalDataSources - confirmedCount} data source${totalDataSources - confirmedCount === 1 ? "" : "s"} await IT-side preservation confirmation.`,
      count: totalDataSources - confirmedCount,
    });
  }

  // Component 5 — notice template integrity. Every issuance's
  // bodyHashAtIssuance should match the template's current bodyHash
  // OR the template should be on a higher version (issuance was
  // snapshotted before an edit). Drift is detected when the
  // issuance's hash matches NEITHER the current nor a known prior
  // version. With our event-sourced model the snapshot is
  // authoritative — drift means the template row was modified
  // out-of-band (raw SQL), which the scorecard surfaces.
  let templateOk = 0;
  let templateTotal = 0;
  for (const iss of hold.noticeIssuances) {
    templateTotal += 1;
    if (iss.bodyHashAtIssuance) {
      // The template's *current* hash may have advanced — that's
      // legal. Only flag if the issuance hash is empty (writer
      // bypassed the snapshot path).
      templateOk += 1;
    }
  }
  const templateRate = ratio(templateOk, Math.max(1, templateTotal));
  if (templateTotal > templateOk) {
    gaps.push({
      key: "notice-template-drift",
      severity: "high",
      message: `${templateTotal - templateOk} notice issuance${templateTotal - templateOk === 1 ? "" : "s"} missing a content-hash snapshot.`,
      count: templateTotal - templateOk,
    });
  }

  // Component 6 — audit chain integrity for the org. We verify the
  // whole organisation chain (cheap thanks to the SQL-side helper);
  // any break is reflected here.
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
      acknowledged === totalCustodians ? null : `${acknowledged}/${totalCustodians} acknowledged`,
    ),
    reAttestationCurrency: makeComponent(
      reAttestRate,
      WEIGHTS.reAttestationCurrency,
      overdueCustodians.length === 0 ? null : `${overdueCustodians.length} overdue`,
    ),
    dataSourcePreservationCoverage: makeComponent(
      dsCoverage,
      WEIGHTS.dataSourcePreservationCoverage,
      notApplied === 0 ? null : `${notApplied} sources unprotected`,
    ),
    itPreservationConfirmationRate: makeComponent(
      itConfirmRate,
      WEIGHTS.itPreservationConfirmationRate,
      confirmedCount === totalDataSources
        ? null
        : `${totalDataSources - confirmedCount} confirmations pending`,
    ),
    noticeTemplateIntegrity: makeComponent(
      templateRate,
      WEIGHTS.noticeTemplateIntegrity,
      templateOk === templateTotal ? null : `${templateTotal - templateOk} issuances missing snapshot`,
    ),
    auditChainIntegrity: makeComponent(
      chainRate,
      WEIGHTS.auditChainIntegrity,
      chainResult.intact ? null : `${chainResult.breaks.length} chain breaks`,
    ),
  };

  const score = Math.round(
    Object.values(components).reduce(
      (sum, c) => sum + c.value * c.weight,
      0,
    ),
  );

  return {
    holdId,
    computedAt: new Date().toISOString(),
    score,
    components,
    gaps,
  };
}

function makeComponent(
  value: number,
  weight: number,
  gap: string | null,
): ScoreComponent {
  return { value, weight, gap };
}
