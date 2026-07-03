/**
 * GET /api/intake/tickets/[id]/sla-legs — per-leg SLA custody clocks
 * (W2-4, issue #111). One SLA window partitioned by the hand-off
 * ledger so a baton pass can't hide a breach. Read-only; staff
 * surface — gated intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getTicketSlaLegs, SlaTicketNotFoundError } from "@aegis/intake/sla";
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
    const legs = await getTicketSlaLegs(actor.organizationId, id);
    return res.status(200).json({ ok: true, ...legs });
  } catch (err) {
    if (err instanceof SlaTicketNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/tickets/[id]/sla-legs] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
