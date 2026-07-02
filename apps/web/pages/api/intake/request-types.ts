/**
 * GET /api/intake/request-types — the ACTIVE configured request types,
 * for the New Request form's type picker (item-1 wiring). Read-only,
 * requester-facing: gated on intake:create_ticket, unlike the admin
 * CRUD namespace at /api/admin/intake/request-types which is gated on
 * admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listRequestTypes } from "@aegis/intake/request-types";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeCreateTicket);
  if (!actor) return;
  const types = await listRequestTypes(actor.organizationId, { includeInactive: false });
  return res.status(200).json({ ok: true, types });
}
