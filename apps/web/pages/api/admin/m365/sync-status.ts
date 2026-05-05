/**
 * GET /api/admin/m365/sync-status
 *
 * Per-org connection status for the /admin/m365 page. Does NOT call
 * Graph — just reports the resolved credential mode and the last
 * verified timestamp. Cheap and safe to poll.
 *
 * Permission gate: admin:m365:manage OR admin:manage_users. The
 * latter is the back-compat path for any admin role row that was
 * seeded before sub-PR 4c.1 added admin:m365:manage to the
 * Permission enum — those rows carry the 38-permission bundle and
 * won't pick up the 39th until the seed re-runs. Restoring
 * admin:manage_users as an alternate gate is the no-deploy fix that
 * unblocks production reads without forcing a re-seed pass.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getM365ConnectionStatus } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.AdminM365Manage,
    Permission.AdminManageUsers,
  ]);
  if (!actor) return;
  const status = await getM365ConnectionStatus(actor.organizationId);
  return res.status(200).json(status);
}
