/**
 * GET /api/admin/m365/sync-status
 *
 * Per-org connection status for the /admin/m365 page. Does NOT call
 * Graph — just reports the resolved credential mode and the last
 * verified timestamp. Cheap and safe to poll.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getM365ConnectionStatus } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  const status = await getM365ConnectionStatus(actor.organizationId);
  return res.status(200).json(status);
}
