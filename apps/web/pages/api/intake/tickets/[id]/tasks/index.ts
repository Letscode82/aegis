/**
 * POST /api/intake/tickets/[id]/tasks — add a sub-task (title, optional
 * assignee). Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  addTask,
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
    const task = await addTask(
      actor.organizationId,
      id,
      {
        title: typeof body.title === "string" ? body.title : "",
        description: typeof body.description === "string" ? body.description : null,
        assigneeUserId: typeof body.assigneeUserId === "string" ? body.assigneeUserId : null,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      },
      { req, res },
    );
    return res.status(201).json({ ok: true, task });
  } catch (err) {
    if (err instanceof TicketNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof WorkTrackingValidationError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/tasks] POST failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
