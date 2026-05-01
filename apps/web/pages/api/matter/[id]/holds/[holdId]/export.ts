import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { exportHoldDefensibility } from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });
  const actor = await requireActor(req, res, Permission.AuditReadAll);
  if (!actor) return;
  try {
    const report = await exportHoldDefensibility(holdId);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="aegis-hold-defensibility-${holdId}-${new Date().toISOString().slice(0, 19)}.json"`,
    );
    res.setHeader("Content-Type", "application/json");
    return res.status(200).send(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error("[hold export] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
