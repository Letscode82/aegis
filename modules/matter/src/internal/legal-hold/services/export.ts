/**
 * Defensibility export — court-ready JSON payload.
 *
 * Produces a structured snapshot of one hold: header, custodians
 * with per-row acknowledgment status, data sources with preservation
 * state, notice issuance roster, full event timeline, and the
 * deterministic scorecard. Builds on the 4a audit-export pattern;
 * 4d adds the AI-generated narrative explanation as an additional
 * field on the score.
 *
 * The PDF rendering is left to the caller — the API route can pipe
 * the JSON into the same `pdfkit`-based formatter that the audit-
 * defensibility export uses, or return JSON directly. This module
 * focuses on the deterministic content; presentation is glue.
 */
import { prisma } from "@aegis/db";
import type { HoldDefensibilityScore } from "../types";
import { getHoldDefensibilityScoreService } from "./defensibility";
import { listHoldSnapshotsService } from "./defensibility-snapshot";

/**
 * Schema versioning:
 *   v1 (4b)   — every component reports a numeric `value` in [0, 1]
 *               even when the component is inapplicable (e.g. zero
 *               custodians acknowledged → reAttestationCurrency
 *               reported as 1.0). Misleading.
 *   v2 (4c.3) — components that aren't currently measurable report
 *               `value: null` and are excluded from the weighted sum
 *               and divisor. v1 readers can still consume v2 by
 *               treating null as missing; the overall `score` field
 *               is unchanged in shape.
 *   v3 (4c.5) — adds a `trend` field: chronological array of
 *               score snapshots (date + score + per-component
 *               values). v2 readers can ignore the new field; the
 *               existing `scorecard` object is unchanged.
 */
export interface HoldDefensibilityExport {
  $schema: "aegis.legal-hold.defensibility.v3";
  generatedAt: string;
  hold: {
    id: string;
    organizationId: string;
    matterId: string;
    holdNumber: string | null;
    title: string;
    scopeDescription: string;
    jurisdictions: string[];
    status: string;
    triggeredAt: string | null;
    triggerEventDescription: string | null;
    issuedAt: string | null;
    releasedAt: string | null;
    privilegeFlags: unknown;
    affectsDepartedCustodians: boolean;
  };
  custodians: Array<{
    id: string;
    personId: string;
    personName: string;
    personEmail: string | null;
    acknowledgedAt: string | null;
    lastReAttestedAt: string | null;
    nextReAttestationDueAt: string | null;
    releasedAt: string | null;
    departureRecordedAt: string | null;
  }>;
  dataSources: Array<{
    id: string;
    legalHoldCustodianId: string;
    type: string;
    externalIdentifier: string;
    displayLabel: string;
    preservationAction: string;
    preservationAppliedAt: string | null;
    preservationConfirmedAt: string | null;
    preservationFailureReason: string | null;
    retentionPolicyConflict: boolean;
  }>;
  noticeIssuances: Array<{
    id: string;
    templateId: string;
    templateVersion: number;
    bodyHashAtIssuance: string;
    recipientCount: number;
    issuedAt: string;
    issuedById: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    summary: string;
    actorId: string | null;
    actorType: string;
    occurredAt: string;
    resultingAuditLogId: string | null;
  }>;
  scorecard: HoldDefensibilityScore;
  /**
   * Chronological score snapshots (sub-PR 4c.5, v3). Each snapshot
   * carries the same component shape as the live scorecard so an
   * off-database auditor can independently reconstruct the trend.
   */
  trend: {
    snapshots: Array<{
      computedAt: string;
      score: number;
      gapCount: number;
      components: HoldDefensibilityScore["components"];
    }>;
  };
}

export async function exportHoldDefensibilityService(
  holdId: string,
): Promise<HoldDefensibilityExport> {
  const hold = await prisma.legalHold.findUnique({
    where: { id: holdId },
    include: {
      custodians: {
        include: {
          person: { select: { name: true, email: true } },
          dataSources: true,
        },
      },
      noticeIssuances: true,
      events: { orderBy: [{ occurredAt: "asc" }] },
    },
  });
  if (!hold) throw new Error(`Hold ${holdId} not found`);

  const scorecard = await getHoldDefensibilityScoreService(holdId);
  const snapshots = await listHoldSnapshotsService(holdId);

  return {
    $schema: "aegis.legal-hold.defensibility.v3",
    generatedAt: new Date().toISOString(),
    hold: {
      id: hold.id,
      organizationId: hold.organizationId,
      matterId: hold.matterId,
      holdNumber: hold.holdNumber,
      title: hold.title,
      scopeDescription: hold.scopeDescription,
      jurisdictions: hold.jurisdictions,
      status: hold.status,
      triggeredAt: hold.triggeredAt?.toISOString() ?? null,
      triggerEventDescription: hold.triggerEventDescription,
      issuedAt: hold.issuedAt?.toISOString() ?? null,
      releasedAt: hold.releasedAt?.toISOString() ?? null,
      privilegeFlags: hold.privilegeFlags,
      affectsDepartedCustodians: hold.affectsDepartedCustodians,
    },
    custodians: hold.custodians.map((c) => ({
      id: c.id,
      personId: c.personId,
      personName: c.person.name,
      personEmail: c.person.email,
      acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
      lastReAttestedAt: c.lastReAttestedAt?.toISOString() ?? null,
      nextReAttestationDueAt: c.nextReAttestationDueAt?.toISOString() ?? null,
      releasedAt: c.releasedAt?.toISOString() ?? null,
      departureRecordedAt: c.departureRecordedAt?.toISOString() ?? null,
    })),
    dataSources: hold.custodians.flatMap((c) =>
      c.dataSources.map((d) => ({
        id: d.id,
        legalHoldCustodianId: d.legalHoldCustodianId,
        type: d.type,
        externalIdentifier: d.externalIdentifier,
        displayLabel: d.displayLabel,
        preservationAction: d.preservationAction,
        preservationAppliedAt: d.preservationAppliedAt?.toISOString() ?? null,
        preservationConfirmedAt: d.preservationConfirmedAt?.toISOString() ?? null,
        preservationFailureReason: d.preservationFailureReason,
        retentionPolicyConflict: d.retentionPolicyConflict,
      })),
    ),
    noticeIssuances: hold.noticeIssuances.map((i) => ({
      id: i.id,
      templateId: i.templateId,
      templateVersion: i.templateVersion,
      bodyHashAtIssuance: i.bodyHashAtIssuance,
      recipientCount: i.recipientCount,
      issuedAt: i.issuedAt.toISOString(),
      issuedById: i.issuedById,
    })),
    events: hold.events.map((e) => ({
      id: e.id,
      type: e.type,
      summary: e.summary,
      actorId: e.actorId,
      actorType: e.actorType,
      occurredAt: e.occurredAt.toISOString(),
      resultingAuditLogId: e.resultingAuditLogId,
    })),
    scorecard,
    trend: {
      snapshots: snapshots.map((s) => ({
        computedAt: s.computedAt,
        score: s.score,
        gapCount: s.gapCount,
        components: s.components as HoldDefensibilityScore["components"],
      })),
    },
  };
}
