/**
 * GET /api/intake/tickets/[id]/delivery — the delivery view: workStatus,
 * assignments (who is involved), and sub-tasks (who is doing what).
 * Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getTicketDelivery, TicketNotFoundError } from "@aegis/intake/work-tracking";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  try {
    const delivery = await getTicketDelivery(actor.organizationId, id);
    return res.status(200).json({ ok: true, delivery });
  } catch (err) {
    if (err instanceof TicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/delivery] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
