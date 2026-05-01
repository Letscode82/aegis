import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { createMatterTask, getMatterTasks } from "@aegis/matter";
import { requireActor, requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
    ]);
    if (!actor) return;
    const matter = await prisma.matter.findFirst({
      where: { id, organizationId: actor.organizationId },
      select: { id: true },
    });
    if (!matter) return res.status(404).json({ error: "Not found" });
    const tasks = await getMatterTasks(id);
    return res.status(200).json(
      tasks.map((t) => ({
        ...t,
        dueDate: t.dueDate?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    );
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterUpdate);
    if (!actor) return;
    const body = (req.body ?? {}) as {
      title?: string;
      description?: string;
      assigneePersonId?: string;
      dueDate?: string;
      source?: string;
      closeoutKey?: string;
      dependsOnTaskId?: string;
    };
    if (!body.title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    try {
      const created = await createMatterTask(
        id,
        {
          title: body.title.trim(),
          description: body.description,
          assigneePersonId: body.assigneePersonId,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          source: body.source,
          closeoutKey: body.closeoutKey,
          dependsOnTaskId: body.dependsOnTaskId,
        },
        actor,
      );
      return res.status(201).json({
        ...created,
        dueDate: created.dueDate?.toISOString() ?? null,
        completedAt: created.completedAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    } catch (err) {
      console.error("[/api/matter/:id/tasks POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
