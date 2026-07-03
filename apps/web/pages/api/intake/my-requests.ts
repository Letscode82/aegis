/**
 * GET /api/intake/my-requests — everything the caller filed, with live
 * status + latest ledger activity (W1-2, issue #104). This is the
 * canonical use of intake:read_own_tickets — self-scoped by
 * construction (requester resolved from the session user).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getMyRequests } from "@aegis/intake/my-work";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadOwnTickets);
  if (!actor) return;
  const requests = await getMyRequests(actor.organizationId, actor.id, actor.email ?? null);
  return res.status(200).json({ ok: true, requests });
}
