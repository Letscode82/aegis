/**
 * GET /api/intake/tickets/[id]/timeline — the ticket's unified,
 * verifiable activity feed from the chain-sealed AuditLog (W1-3,
 * issue #105). Staff surface — gated intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getTicketTimeline,
  TimelineTicketNotFoundError,
} from "@aegis/intake/timeline";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing ticket id" });
  try {
    const events = await getTicketTimeline(actor.organizationId, id);
    return res.status(200).json({ ok: true, events });
  } catch (err) {
    if (err instanceof TimelineTicketNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/tickets/[id]/timeline] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
