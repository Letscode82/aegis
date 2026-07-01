/**
 * GET    /api/admin/intake/teams/[id]  — one pool (+members)
 * PUT    /api/admin/intake/teams/[id]  — update pool config
 * DELETE /api/admin/intake/teams/[id]  — delete pool
 *
 * Item 5 (tiering). Gated on admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getTeam,
  updateTeam,
  deleteTeam,
  TeamNotFoundError,
  TeamValidationError,
} from "@aegis/intake/teams";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing team id" });

  try {
    if (req.method === "GET") {
      const team = await getTeam(actor.organizationId, id);
      return res.status(200).json({ ok: true, team });
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const team = await updateTeam(
        actor.organizationId,
        id,
        {
          key: typeof body.key === "string" ? body.key : undefined,
          name: typeof body.name === "string" ? body.name : undefined,
          description:
            body.description === null || typeof body.description === "string"
              ? (body.description as string | null)
              : undefined,
          active: typeof body.active === "boolean" ? body.active : undefined,
          strategy: typeof body.strategy === "string" ? body.strategy : undefined,
          overflowTeamId:
            body.overflowTeamId === null || typeof body.overflowTeamId === "string"
              ? (body.overflowTeamId as string | null)
              : undefined,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, team });
    }
    if (req.method === "DELETE") {
      await deleteTeam(actor.organizationId, id, { req, res });
      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    if (err instanceof TeamNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    if (err instanceof TeamValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[/api/admin/intake/teams/[id]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
