import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { TaskDependencyNotMetError, completeMatterTask } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const taskId = req.query.taskId;
  if (typeof taskId !== "string") {
    return res.status(400).json({ error: "Invalid taskId" });
  }
  const actor = await requireActor(req, res, Permission.MatterUpdate);
  if (!actor) return;
  try {
    const completed = await completeMatterTask(taskId, actor);
    res.status(200).json({
      ...completed,
      dueDate: completed.dueDate?.toISOString() ?? null,
      completedAt: completed.completedAt?.toISOString() ?? null,
      createdAt: completed.createdAt.toISOString(),
      updatedAt: completed.updatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof TaskDependencyNotMetError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[/api/matter/tasks/:taskId/complete] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
