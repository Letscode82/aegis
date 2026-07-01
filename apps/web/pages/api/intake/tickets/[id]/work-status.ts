/**
 * PUT /api/intake/tickets/[id]/work-status — set the delivery workStatus
 * (distinct from the request status). Body: { workStatus }.
 * Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { setWorkStatus, TicketNotFoundError } from "@aegis/intake/work-tracking";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const delivery = await setWorkStatus(
      actor.organizationId,
      id,
      typeof body.workStatus === "string" ? body.workStatus : null,
      { req, res },
    );
    return res.status(200).json({ ok: true, delivery });
  } catch (err) {
    if (err instanceof TicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/work-status] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
