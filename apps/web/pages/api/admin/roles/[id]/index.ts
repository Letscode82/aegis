import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { RoleNotFoundError, getRole } from "@aegis/admin";
import { requireActor } from "../../../../../lib/matter-actor";

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
  const actor = await requireActor(req, res, Permission.AdminManageRoles);
  if (!actor) return;
  try {
    const role = await getRole(id, actor.organizationId);
    return res.status(200).json(role);
  } catch (err) {
    if (err instanceof RoleNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[/api/admin/roles/:id GET] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
