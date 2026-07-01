/**
 * PUT    /api/admin/intake/teams/[id]/members/[memberId]  — edit capacity/active
 * DELETE /api/admin/intake/teams/[id]/members/[memberId]  — remove a member
 *
 * Item 5 (tiering). Gated on admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  updateTeamMember,
  removeTeamMember,
  TeamNotFoundError,
  TeamValidationError,
} from "@aegis/intake/teams";
import { requireActor } from "../../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  const memberId = typeof req.query.memberId === "string" ? req.query.memberId : "";
  if (!id || !memberId) {
    return res.status(400).json({ ok: false, error: "Missing team or member id" });
  }

  try {
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const team = await updateTeamMember(
        actor.organizationId,
        id,
        memberId,
        {
          capacity: typeof body.capacity === "number" ? body.capacity : undefined,
          active: typeof body.active === "boolean" ? body.active : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, team });
    }
    if (req.method === "DELETE") {
      const team = await removeTeamMember(actor.organizationId, id, memberId, {
        req,
        res,
      });
      return res.status(200).json({ ok: true, team });
    }
  } catch (err) {
    if (err instanceof TeamNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    if (err instanceof TeamValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[/api/admin/intake/teams/[id]/members/[memberId]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
