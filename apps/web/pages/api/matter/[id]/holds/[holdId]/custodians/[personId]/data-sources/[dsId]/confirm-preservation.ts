/**
 * POST — mark a data source as IT-side confirmed. Stamps
 *        `preservationConfirmedAt` + `preservationConfirmedById`,
 *        fires DATA_SOURCE_PRESERVATION_CONFIRMED. Gated by
 *        `matter:legal_hold:issue` (admin/legal-ops privilege).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { confirmDataSourcePreservation } from "@aegis/matter";
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

  try {
    const updated = await confirmDataSourcePreservation(
      { dataSourceId: dsId },
      actor,
    );
    return res.status(200).json({
      id: updated.id,
      preservationConfirmedAt:
        updated.preservationConfirmedAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[confirm-preservation] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
