/**
 * GET /api/matter/[id]/holds/[holdId]/notices/[issuanceId]
 *
 * Returns a single HoldNoticeIssuance with the rendered notice
 * body, body hash, and recipient roster — the defensibility
 * evidence surface (4c.3 Item 7).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getNoticeIssuanceForViewer } from "@aegis/matter";
import { requireActorAny } from "../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  const issuanceId = req.query.issuanceId;
  if (typeof holdId !== "string" || typeof issuanceId !== "string") {
    return res.status(400).json({ error: "Invalid params" });
  }

  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
  ]);
  if (!actor) return;

  try {
    const result = await getNoticeIssuanceForViewer(
      holdId,
      issuanceId,
      actor,
    );
    if (!result) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[notices/[issuanceId]] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
