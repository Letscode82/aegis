import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getHoldDefensibilityScore } from "@aegis/matter";
import { requireActorAny } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.AuditReadAll,
  ]);
  if (!actor) return;
  try {
    const score = await getHoldDefensibilityScore(holdId);
    return res.status(200).json(score);
  } catch (err) {
    console.error("[scorecard] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
