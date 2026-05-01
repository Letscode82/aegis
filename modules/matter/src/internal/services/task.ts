/**
 * MatterTask service — create / complete / list.
 *
 * Task completion has two side-effects beyond setting status=DONE:
 *   1. If the task carries a closeoutKey, the matching item on
 *      Matter.closeoutChecklistJson is marked completed (closing the
 *      gap with the closeout gate).
 *   2. A timeline event + audit row are written.
 *
 * Task dependency is enforced soft-style: completing a task whose
 * dependsOnTaskId is not DONE throws.
 */
import { prisma, type MatterTask } from "@aegis/db";
import type {
  CreateTaskInput,
  MatterActor,
  CloseoutChecklistItem,
} from "../types";
import { markCompleted, readChecklist } from "./closeout";
import { recordMatterEvent } from "./timeline";

export async function createMatterTaskService(
  matterId: string,
  input: CreateTaskInput,
  actor: MatterActor,
): Promise<MatterTask> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!matter) {
    throw new Error(
      `Matter ${matterId} not found in organization ${actor.organizationId}`,
    );
  }

  if (input.dependsOnTaskId) {
    const dep = await prisma.matterTask.findFirst({
      where: { id: input.dependsOnTaskId, matterId },
      select: { id: true },
    });
    if (!dep) {
      throw new Error(
        `Dependency task ${input.dependsOnTaskId} not found on matter ${matterId}`,
      );
    }
  }

  const task = await prisma.matterTask.create({
    data: {
      matterId,
      title: input.title,
      description: input.description,
      assigneeId: input.assigneePersonId,
      dueDate: input.dueDate,
      source: input.source ?? "manual",
      closeoutKey: input.closeoutKey,
      dependsOnTaskId: input.dependsOnTaskId,
      createdBy: actor.id,
    },
  });

  await recordMatterEvent({
    matterId,
    actor,
    eventType: "matter.task.created",
    auditAction: "matter.task.created",
    summary: `Task created: ${input.title}`,
    afterJson: {
      id: task.id,
      title: task.title,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate?.toISOString() ?? null,
      source: task.source,
    },
    metadata: { taskId: task.id, source: task.source },
  });

  return task;
}

export class TaskDependencyNotMetError extends Error {
  constructor(taskId: string, blockerId: string, blockerStatus: string) {
    super(
      `Task ${taskId} cannot complete — blocker ${blockerId} is ${blockerStatus} (expected DONE)`,
    );
    this.name = "TaskDependencyNotMetError";
  }
}

export async function completeMatterTaskService(
  taskId: string,
  actor: MatterActor,
): Promise<MatterTask> {
  const task = await prisma.matterTask.findFirst({
    where: { id: taskId, matter: { organizationId: actor.organizationId } },
  });
  if (!task) {
    throw new Error(
      `Task ${taskId} not found in organization ${actor.organizationId}`,
    );
  }
  if (task.status === "DONE") return task;

  if (task.dependsOnTaskId) {
    const blocker = await prisma.matterTask.findUnique({
      where: { id: task.dependsOnTaskId },
      select: { status: true },
    });
    if (!blocker || blocker.status !== "DONE") {
      throw new TaskDependencyNotMetError(
        taskId,
        task.dependsOnTaskId,
        blocker?.status ?? "MISSING",
      );
    }
  }

  const completed = await prisma.matterTask.update({
    where: { id: taskId },
    data: {
      status: "DONE",
      completedAt: new Date(),
      completedBy: actor.id,
    },
  });

  // Tick closeout checklist if this task carries a key.
  if (completed.closeoutKey) {
    const matter = await prisma.matter.findUnique({
      where: { id: completed.matterId },
      select: { closeoutChecklistJson: true },
    });
    if (matter) {
      const updatedItems: CloseoutChecklistItem[] = markCompleted(
        readChecklist(matter.closeoutChecklistJson),
        completed.closeoutKey,
        actor.id,
      );
      await prisma.matter.update({
        where: { id: completed.matterId },
        data: { closeoutChecklistJson: updatedItems as unknown as object },
      });
    }
  }

  await recordMatterEvent({
    matterId: completed.matterId,
    actor,
    eventType: "matter.task.completed",
    auditAction: "matter.task.completed",
    summary: `Task completed: ${completed.title}`,
    beforeJson: { status: task.status },
    afterJson: {
      status: "DONE",
      completedAt: completed.completedAt?.toISOString() ?? null,
    },
    metadata: { taskId: completed.id, closeoutKey: completed.closeoutKey },
  });

  return completed;
}

export async function getMatterTasksService(
  matterId: string,
): Promise<MatterTask[]> {
  return prisma.matterTask.findMany({
    where: { matterId },
    orderBy: [
      { status: "asc" },
      { dueDate: "asc" },
      { createdAt: "asc" },
    ],
  });
}
