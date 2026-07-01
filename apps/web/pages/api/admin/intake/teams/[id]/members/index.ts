/**
 * POST /api/admin/intake/teams/[id]/members  — add a member to a pool
 *
 * Item 5 (tiering). Gated on admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  addTeamMember,
  TeamNotFoundError,
  TeamValidationError,
} from "@aegis/intake/teams";
import { requireActor } from "../../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing team id" });

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const team = await addTeamMember(
        actor.organizationId,
        id,
        {
          userId: typeof body.userId === "string" ? body.userId : "",
          capacity: typeof body.capacity === "number" ? body.capacity : undefined,
          active: typeof body.active === "boolean" ? body.active : undefined,
        },
        { req, res },
      );
      return res.status(201).json({ ok: true, team });
    } catch (err) {
      if (err instanceof TeamNotFoundError) {
        return res.status(404).json({ ok: false, error: err.message });
      }
      if (err instanceof TeamValidationError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      console.error("[/api/admin/intake/teams/[id]/members] POST failed:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  }
  res.setHeader("Allow", "POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
