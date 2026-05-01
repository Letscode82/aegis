import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  AdminSupersetViolationError,
  RoleNotFoundError,
  updateRolePermissions,
} from "@aegis/admin";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageRoles);
  if (!actor) return;

  const body = (req.body ?? {}) as { permissions?: unknown };
  if (!Array.isArray(body.permissions)) {
    return res.status(400).json({ error: "permissions must be an array" });
  }
  const permissions = body.permissions.filter(
    (p): p is Permission => typeof p === "string",
  ) as Permission[];

  try {
    const updated = await updateRolePermissions(
      { roleId: id, permissions },
      actor,
    );
    return res.status(200).json(updated);
  } catch (err) {
    if (err instanceof AdminSupersetViolationError) {
      return res.status(409).json({ error: err.message, missing: err.missing });
    }
    if (err instanceof RoleNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    console.error("[/api/admin/roles/:id/permissions PUT] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
