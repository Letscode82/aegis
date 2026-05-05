/**
 * GET /api/admin/m365/delegated-status
 *
 * Returns the current delegated-auth state for the actor's org.
 * Cheap: hits the OrganizationM365Credential row, no Graph calls.
 *
 * Permission gate: admin:m365:manage OR admin:manage_users. Read
 * endpoints accept either so the /admin/m365 page renders for any
 * existing admin even if the seed re-run hasn't propagated the new
 * admin:m365:manage permission to their persisted role row. The
 * write/connect endpoints (delegated-connect/initiate,
 * delegated-disconnect, delegated-test) still require the new
 * permission since they mutate state.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getDelegatedAuthStatus } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const actor = await requireActorAny(req, res, [
    Permission.AdminM365Manage,
    Permission.AdminManageUsers,
  ]);
  if (!actor) return;
  const status = await getDelegatedAuthStatus(actor.organizationId);
  return res.status(200).json({ ok: true, ...status });
}
