import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listRoles } from "@aegis/admin";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Both admin:manage_roles AND admin:manage_users need the role list
  // (the user invite dropdown reads /api/admin/roles), so accept either.
  const actor = await requireActorAny(req, res, [
    Permission.AdminManageRoles,
    Permission.AdminManageUsers,
  ]);
  if (!actor) return;
  try {
    const roles = await listRoles(actor.organizationId);
    return res.status(200).json(roles);
  } catch (err) {
    console.error("[/api/admin/roles GET] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
