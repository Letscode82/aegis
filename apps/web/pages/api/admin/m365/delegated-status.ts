/**
 * GET /api/admin/m365/delegated-status
 *
 * Returns the current delegated-auth state for the actor's org.
 * Cheap: hits the OrganizationM365Credential row, no Graph calls.
 *
 * Permission: admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getDelegatedAuthStatus } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;
  const status = await getDelegatedAuthStatus(actor.organizationId);
  return res.status(200).json(status);
}
