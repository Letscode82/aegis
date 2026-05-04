/**
 * POST — mark a data source as preservation-applied. Body:
 *          { reasonCode: string }
 * Gated by `matter:legal_hold:issue`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { applyDataSourcePreservation } from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const dsId = req.query.dsId;
  if (typeof dsId !== "string")
    return res.status(400).json({ error: "Invalid dsId" });

  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  // Cross-org guard: confirm the data source belongs to the actor's org
  // before crossing into the service (the service does its own check
  // but we want a 404 not a 500 for foreign-org leakage).
  const ds = await prisma.custodianDataSource.findUnique({
    where: { id: dsId },
    select: {
      legalHoldCustodian: {
        select: { legalHold: { select: { organizationId: true } } },
      },
    },
  });
  if (
    !ds ||
    ds.legalHoldCustodian.legalHold.organizationId !== actor.organizationId
  ) {
    return res.status(404).json({ error: "Data source not found" });
  }

  const body = (req.body ?? {}) as { reasonCode?: string };
  try {
    const updated = await applyDataSourcePreservation(
      { dataSourceId: dsId, reasonCode: body.reasonCode ?? "manual_apply" },
      actor,
    );
    return res.status(200).json({
      id: updated.id,
      preservationAppliedAt: updated.preservationAppliedAt?.toISOString() ?? null,
      preservationAction: updated.preservationAction,
    });
  } catch (err) {
    console.error("[apply-preservation] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
