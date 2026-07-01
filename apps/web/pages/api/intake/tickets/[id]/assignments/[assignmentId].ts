/**
 * DELETE /api/intake/tickets/[id]/assignments/[assignmentId] — remove a
 * delivery assignment. Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { removeAssignment, WorkItemNotFoundError } from "@aegis/intake/work-tracking";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const assignmentId = typeof req.query.assignmentId === "string" ? req.query.assignmentId : "";
  try {
    await removeAssignment(actor.organizationId, assignmentId, { req, res });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof WorkItemNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/assignments/[assignmentId]] DELETE failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
