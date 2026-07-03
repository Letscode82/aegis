/**
 * PUT|DELETE /api/intake/tickets/[id]/tasks/[taskId] — update or remove a
 * sub-task. Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  updateTask,
  removeTask,
  logTaskEffort,
  WorkItemNotFoundError,
  WorkTrackingValidationError,
} from "@aegis/intake/work-tracking";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  const taskId = typeof req.query.taskId === "string" ? req.query.taskId : "";
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (req.method === "PUT") {
      // W3-5 — effort quick entry rides the same endpoint: a body with
      // logEffortMinutes increments the task's logged time (audited).
      if (typeof body.logEffortMinutes === "number") {
        const task = await logTaskEffort(
          actor.organizationId,
          taskId,
          body.logEffortMinutes,
          { req, res },
        );
        return res.status(200).json({ ok: true, task });
      }
      const task = await updateTask(
        actor.organizationId,
        taskId,
        {
          title: typeof body.title === "string" ? body.title : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          assigneeUserId: typeof body.assigneeUserId === "string" ? body.assigneeUserId : undefined,
          status: typeof body.status === "string" ? body.status : undefined,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, task });
    }
    if (req.method === "DELETE") {
      await removeTask(actor.organizationId, taskId, { req, res });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof WorkItemNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof WorkTrackingValidationError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/tasks/[taskId]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
