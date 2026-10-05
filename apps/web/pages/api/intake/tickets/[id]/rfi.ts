/**
 * GET  /api/intake/tickets/[id]/rfi — list the ticket's RFIs (newest first).
 * POST /api/intake/tickets/[id]/rfi — reviewer sends a new RFI.
 *   Body: { question: string }
 *
 * CW-5 — Cockpit RFI round-trip. Reviewer side, gated
 * `intake:read_all_tickets` (only triagers see every ticket). The answer /
 * cancel transitions live at .../rfi/[rfiId].
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listRfisForTicket,
  sendRfi,
  RfiTicketNotFoundError,
  RfiValidationError,
} from "@aegis/intake/rfi";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing ticket id" });

  try {
    if (req.method === "GET") {
      const rfis = await listRfisForTicket(actor.organizationId, id);
      return res.status(200).json({ ok: true, rfis });
    }
    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const rfi = await sendRfi(
        actor.organizationId,
        id,
        { question: typeof body.question === "string" ? body.question : "" },
        { req, res },
      );
      return res.status(200).json({ ok: true, rfi });
    }
  } catch (err) {
    if (err instanceof RfiTicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof RfiValidationError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/rfi] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
