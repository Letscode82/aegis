/**
 * GET /api/intake/parties/candidates?q= — org Persons + Counterparties
 * for the add-party picker (Track 1, item 5). Gated intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listPartyCandidates } from "@aegis/intake/parties";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const candidates = await listPartyCandidates(actor.organizationId, q);
  return res.status(200).json({ ok: true, ...candidates });
}
