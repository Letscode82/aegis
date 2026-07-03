/**
 * POST /api/intake/tickets/[id]/advance-stage — move the ticket one
 * step through its stage sequence (W1-5, issue #107). Server-enforced,
 * audited, stamps the per-stage timestamp trail.
 * Gated intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  advanceTicketStage,
  StageTicketNotFoundError,
  FinalStageError,
} from "@aegis/intake/stage";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing ticket id" });
  try {
    const result = await advanceTicketStage(actor.organizationId, id, { req, res });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof StageTicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof FinalStageError) return res.status(409).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/advance-stage] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
