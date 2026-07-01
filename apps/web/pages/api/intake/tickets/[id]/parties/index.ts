/**
 * GET  /api/intake/tickets/[id]/parties — people/entities involved
 * POST /api/intake/tickets/[id]/parties — add one (personId | counterpartyId + role)
 * Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listParties,
  addParty,
  TicketNotFoundError,
  PartyValidationError,
} from "@aegis/intake/parties";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  try {
    if (req.method === "GET") {
      const parties = await listParties(actor.organizationId, id);
      return res.status(200).json({ ok: true, parties });
    }
    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const party = await addParty(
        actor.organizationId,
        id,
        {
          personId: typeof body.personId === "string" ? body.personId : null,
          counterpartyId: typeof body.counterpartyId === "string" ? body.counterpartyId : null,
          role: typeof body.role === "string" ? body.role : undefined,
          note: typeof body.note === "string" ? body.note : null,
        },
        { req, res },
      );
      return res.status(201).json({ ok: true, party });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof TicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof PartyValidationError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/parties] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
