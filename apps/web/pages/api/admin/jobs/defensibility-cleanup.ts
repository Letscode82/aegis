/**
 * POST /api/admin/jobs/defensibility-cleanup
 *
 * Runs the weekly snapshot retention pass. Keeps every snapshot
 * from the last 90 days at original resolution; older snapshots
 * thinned to one per ISO week. Idempotent.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { runWeeklyCleanupPass } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  try {
    const result = await runWeeklyCleanupPass(actor.organizationId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[jobs/defensibility-cleanup] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
