import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getMatterCostBasis } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.SpendReadMatterBudget,
  ]);
  if (!actor) return;
  try {
    const data = await getMatterCostBasis(id);
    res.status(200).json({
      ...data,
      budgetAllocated: Number(data.budgetAllocated),
      spentToDate: Number(data.spentToDate),
    });
  } catch (err) {
    console.error("[/api/matter/:id/cost-basis] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
