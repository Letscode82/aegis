/**
 * GET  /api/admin/m365/verify-credentials
 *
 * Round-trips Graph /organization to confirm the resolved
 * credentials work. Updates lastVerifiedAt + lastErrorMessage on
 * the OrganizationM365Credential row when one exists.
 *
 * Permission gate: admin:m365:manage OR admin:manage_users.
 * Sub-PR 4c.1 swapped the gate from admin:manage_users to
 * admin:m365:manage; that broke production because seeded admin
 * role rows didn't carry the new 39th permission yet. We accept
 * either to keep existing admins able to verify while still
 * recognising the new connection-management permission.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { verifyM365Credentials } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET,POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.AdminM365Manage,
    Permission.AdminManageUsers,
  ]);
  if (!actor) return;
  try {
    const result = await verifyM365Credentials(actor.organizationId);
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    console.error("[/api/admin/m365/verify-credentials] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
