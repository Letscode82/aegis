/**
 * POST /api/intake/tickets/[id]/assignments — add a delivery assignment
 * (userId + role). Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  addAssignment,
  TicketNotFoundError,
  WorkTrackingValidationError,
} from "@aegis/intake/work-tracking";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const assignment = await addAssignment(
      actor.organizationId,
      id,
      {
        userId: typeof body.userId === "string" ? body.userId : "",
        role: typeof body.role === "string" ? body.role : undefined,
      },
      { req, res },
    );
    return res.status(201).json({ ok: true, assignment });
  } catch (err) {
    if (err instanceof TicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof WorkTrackingValidationError) return res.status(400).json({ ok: false, error: err.message });
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002")
      return res.status(409).json({ ok: false, error: "That user already has that role on this ticket." });
    console.error("[/api/intake/tickets/[id]/assignments] POST failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
