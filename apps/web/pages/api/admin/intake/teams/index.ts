/**
 * GET  /api/admin/intake/teams   — list intake pools (+members)
 * POST /api/admin/intake/teams   — create a pool
 *
 * Item 5 (tiering) — routing pools. Gated on admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listTeams,
  createTeam,
  TeamValidationError,
} from "@aegis/intake/teams";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  if (req.method === "GET") {
    const teams = await listTeams(actor.organizationId);
    return res.status(200).json({ ok: true, teams });
  }
  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const team = await createTeam(
        actor.organizationId,
        {
          key: typeof body.key === "string" ? body.key : undefined,
          name: typeof body.name === "string" ? body.name : "",
          description: typeof body.description === "string" ? body.description : null,
          active: typeof body.active === "boolean" ? body.active : undefined,
          strategy: typeof body.strategy === "string" ? body.strategy : undefined,
          overflowTeamId:
            typeof body.overflowTeamId === "string" ? body.overflowTeamId : null,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        },
        { req, res },
      );
      return res.status(201).json({ ok: true, team });
    } catch (err) {
      if (err instanceof TeamValidationError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      console.error("[/api/admin/intake/teams] POST failed:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
