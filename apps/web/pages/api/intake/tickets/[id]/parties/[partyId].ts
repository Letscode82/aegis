/**
 * PUT|DELETE /api/intake/tickets/[id]/parties/[partyId] — update role/note
 * or remove a party. Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  updateParty,
  removeParty,
  PartyNotFoundError,
  PartyValidationError,
} from "@aegis/intake/parties";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const partyId = typeof req.query.partyId === "string" ? req.query.partyId : "";
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (req.method === "PUT") {
      const party = await updateParty(
        actor.organizationId,
        partyId,
        {
          role: typeof body.role === "string" ? body.role : undefined,
          note: typeof body.note === "string" ? body.note : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, party });
    }
    if (req.method === "DELETE") {
      await removeParty(actor.organizationId, partyId, { req, res });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof PartyNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof PartyValidationError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/parties/[partyId]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
