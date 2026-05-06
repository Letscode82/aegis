/**
 * GET  /api/matter/[id]/holds/[holdId]/custodians   — list
 * POST /api/matter/[id]/holds/[holdId]/custodians   — add
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { addHoldCustodian } from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActor, requireActorAny } from "../../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterLegalHoldCustodianView,
    ]);
    if (!actor) return;
    const rows = await prisma.legalHoldCustodian.findMany({
      where: {
        legalHoldId: holdId,
        legalHold: { organizationId: actor.organizationId },
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
        dataSources: true,
      },
      orderBy: [{ createdAt: "asc" }],
    });
    return res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        personId: r.personId,
        personName: r.person.name,
        personEmail: r.person.email,
        acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        acknowledgmentMetadata: r.acknowledgmentMetadata ?? null,
        lastReAttestedAt: r.lastReAttestedAt?.toISOString() ?? null,
        nextReAttestationDueAt: r.nextReAttestationDueAt?.toISOString() ?? null,
        releasedAt: r.releasedAt?.toISOString() ?? null,
        departureRecordedAt: r.departureRecordedAt?.toISOString() ?? null,
        dataSources: r.dataSources.map((d) => ({
          id: d.id,
          type: d.type,
          displayLabel: d.displayLabel,
          preservationAction: d.preservationAction,
          preservationAppliedAt: d.preservationAppliedAt?.toISOString() ?? null,
          preservationConfirmedAt: d.preservationConfirmedAt?.toISOString() ?? null,
          retentionPolicyConflict: d.retentionPolicyConflict,
          // Sub-PR 4d.0 — lifecycle status drives the workspace's
          // colored badges + Retry button.
          preservationStatus: d.preservationStatus,
          preservationFailureReason: d.preservationFailureReason ?? null,
        })),
      })),
    );
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
    if (!actor) return;
    const body = (req.body ?? {}) as { personId?: string };
    if (!body.personId) return res.status(400).json({ error: "personId required" });
    try {
      const created = await addHoldCustodian(
        { holdId, personId: body.personId },
        actor,
      );
      return res.status(201).json({
        id: created.id,
        personId: created.personId,
        nextReAttestationDueAt: created.nextReAttestationDueAt?.toISOString() ?? null,
      });
    } catch (err) {
      console.error("[/api/matter/:id/holds/:holdId/custodians POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
