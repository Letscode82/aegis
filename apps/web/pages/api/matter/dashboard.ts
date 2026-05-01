import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getMatterDashboardStats } from "@aegis/matter";
import { requireActorAny } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
  ]);
  if (!actor) return;
  try {
    const stats = await getMatterDashboardStats(actor.organizationId);
    res.status(200).json({
      ...stats,
      // Decimals from Prisma serialise as strings; the handler converts
      // to plain numbers for the JSON wire format the UI expects.
      exposureSum: Number(stats.exposureSum),
      spentToDateSum: Number(stats.spentToDateSum),
    });
  } catch (err) {
    console.error("[/api/matter/dashboard] failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}
