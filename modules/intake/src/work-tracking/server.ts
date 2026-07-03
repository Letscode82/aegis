/**
 * Intake work-tracking (Phase 1 — delivery layer).
 *
 * Beneath the request-level status sits the *delivery* layer: who is
 * involved (assignments with a role), what sub-tasks make up the work
 * (who is doing what + status), and a delivery `workStatus` distinct from
 * the request lifecycle status. This is the "how delivery is happening"
 * surface the GCC manager needs.
 *
 * `userId` references are application-level (User.id strings, no FK — same
 * pattern as AuditLog.actorId) so the tier/pool model can populate them.
 * Every mutation is org-scoped via the ticket and writes an AuditLog row.
 *
 * Server-only — imports @aegis/db.
 */
import { prisma, logAudit, getCurrentUser } from "@aegis/db";

export interface AssignmentDTO {
  id: string;
  userId: string;
  role: string;
  assignedAt: string;
  assignedById: string | null;
}
export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  status: string;
  sortOrder: number;
  /** W3-5 — cumulative logged minutes. */
  effortMinutes: number;
}
export interface TicketDeliveryDTO {
  ticketId: string;
  workStatus: string | null;
  assignments: AssignmentDTO[];
  tasks: TaskDTO[];
}

type Ctx = {
  req?: { headers: Record<string, string | string[] | undefined> };
  res?: unknown;
};

export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Intake ticket ${id} not found`);
    this.name = "TicketNotFoundError";
  }
}
export class WorkItemNotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
    this.name = "WorkItemNotFoundError";
  }
}
export class WorkTrackingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkTrackingValidationError";
  }
}

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done"] as const;

/** Assert the ticket exists in the org; return it. */
async function requireTicket(organizationId: string, ticketId: string) {
  const t = await prisma.intakeTicket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true, workStatus: true },
  });
  if (!t) throw new TicketNotFoundError(ticketId);
  return t;
}

export async function getTicketDelivery(
  organizationId: string,
  ticketId: string,
): Promise<TicketDeliveryDTO> {
  const ticket = await requireTicket(organizationId, ticketId);
  const [assignments, tasks] = await Promise.all([
    prisma.intakeTicketAssignment.findMany({
      where: { ticketId },
      orderBy: { assignedAt: "asc" },
    }),
    prisma.intakeTicketTask.findMany({
      where: { ticketId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return {
    ticketId,
    workStatus: ticket.workStatus,
    assignments: assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      role: a.role,
      assignedAt: a.assignedAt.toISOString(),
      assignedById: a.assignedById,
    })),
    tasks: tasks.map(toTaskDTO),
  };
}

export async function addAssignment(
  organizationId: string,
  ticketId: string,
  input: { userId: string; role?: string },
  ctx: Ctx = {},
): Promise<AssignmentDTO> {
  await requireTicket(organizationId, ticketId);
  const userId = (input.userId ?? "").trim();
  if (!userId) throw new WorkTrackingValidationError("userId is required.");
  const role = (input.role ?? "support").trim() || "support";
  const actor = await getCurrentUser(ctx.req, ctx.res);
  const created = await prisma.intakeTicketAssignment.create({
    data: { ticketId, userId, role, assignedById: actor.id },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.assignment_added",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    afterJson: { assignmentId: created.id, userId, role },
  });
  return {
    id: created.id,
    userId: created.userId,
    role: created.role,
    assignedAt: created.assignedAt.toISOString(),
    assignedById: created.assignedById,
  };
}

export async function removeAssignment(
  organizationId: string,
  assignmentId: string,
  ctx: Ctx = {},
): Promise<void> {
  const row = await prisma.intakeTicketAssignment.findFirst({
    where: { id: assignmentId, ticket: { organizationId } },
    select: { id: true, ticketId: true, userId: true, role: true },
  });
  if (!row) throw new WorkItemNotFoundError("Assignment", assignmentId);
  await prisma.intakeTicketAssignment.delete({ where: { id: assignmentId } });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.assignment_removed",
    resourceType: "IntakeTicket",
    resourceId: row.ticketId,
    beforeJson: { assignmentId, userId: row.userId, role: row.role },
  });
}

export async function addTask(
  organizationId: string,
  ticketId: string,
  input: { title: string; description?: string | null; assigneeUserId?: string | null; sortOrder?: number },
  ctx: Ctx = {},
): Promise<TaskDTO> {
  await requireTicket(organizationId, ticketId);
  const title = (input.title ?? "").trim();
  if (!title) throw new WorkTrackingValidationError("title is required.");
  const actor = await getCurrentUser(ctx.req, ctx.res);
  const created = await prisma.intakeTicketTask.create({
    data: {
      ticketId,
      title,
      description: input.description?.trim() || null,
      assigneeUserId: input.assigneeUserId?.trim() || null,
      sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : 100,
    },
  });
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.task_added",
    resourceType: "IntakeTicket",
    resourceId: ticketId,
    afterJson: { taskId: created.id, title, assigneeUserId: created.assigneeUserId },
  });
  return toTaskDTO(created);
}

export async function updateTask(
  organizationId: string,
  taskId: string,
  patch: { title?: string; description?: string | null; assigneeUserId?: string | null; status?: string; sortOrder?: number },
  ctx: Ctx = {},
): Promise<TaskDTO> {
  const before = await prisma.intakeTicketTask.findFirst({
    where: { id: taskId, ticket: { organizationId } },
  });
  if (!before) throw new WorkItemNotFoundError("Task", taskId);
  if (patch.status !== undefined && !TASK_STATUSES.includes(patch.status as (typeof TASK_STATUSES)[number])) {
    throw new WorkTrackingValidationError(`status must be one of ${TASK_STATUSES.join(", ")}.`);
  }
  const data: Record<string, unknown> = {};
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.assigneeUserId !== undefined) data.assigneeUserId = patch.assigneeUserId?.trim() || null;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;

  const updated = await prisma.intakeTicketTask.update({ where: { id: taskId }, data });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.task_updated",
    resourceType: "IntakeTicket",
    resourceId: before.ticketId,
    beforeJson: { taskId, status: before.status, assigneeUserId: before.assigneeUserId },
    afterJson: { taskId, status: updated.status, assigneeUserId: updated.assigneeUserId },
  });
  return toTaskDTO(updated);
}

export async function removeTask(
  organizationId: string,
  taskId: string,
  ctx: Ctx = {},
): Promise<void> {
  const before = await prisma.intakeTicketTask.findFirst({
    where: { id: taskId, ticket: { organizationId } },
    select: { id: true, ticketId: true, title: true },
  });
  if (!before) throw new WorkItemNotFoundError("Task", taskId);
  await prisma.intakeTicketTask.delete({ where: { id: taskId } });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.ticket.task_removed",
    resourceType: "IntakeTicket",
    resourceId: before.ticketId,
    beforeJson: { taskId, title: before.title },
  });
}

export async function setWorkStatus(
  organizationId: string,
  ticketId: string,
  workStatus: string | null,
  ctx: Ctx = {},
): Promise<TicketDeliveryDTO> {
  const before = await requireTicket(organizationId, ticketId);
  const next = workStatus?.trim() || null;
  if (before.workStatus !== next) {
    await prisma.intakeTicket.update({ where: { id: ticketId }, data: { workStatus: next } });
    const actor = await getCurrentUser(ctx.req, ctx.res);
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "intake.ticket.work_status_changed",
      resourceType: "IntakeTicket",
      resourceId: ticketId,
      beforeJson: { workStatus: before.workStatus },
      afterJson: { workStatus: next },
    });
  }
  return getTicketDelivery(organizationId, ticketId);
}

function toTaskDTO(t: {
  id: string;
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  status: string;
  sortOrder: number;
  effortMinutes: number;
}): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    assigneeUserId: t.assigneeUserId,
    status: t.status,
    sortOrder: t.sortOrder,
    effortMinutes: t.effortMinutes,
  };
}

// ── W3-5 · Effort capture — minutes-per-task quick entry ─────────────

/** One log = one chain-sealed audit row; the column is the fast total.
 *  Feeds effort-per-tier in the Pool Ops dashboard (attributed to the
 *  session user who logged it — the person who did the work). */
export async function logTaskEffort(
  organizationId: string,
  taskId: string,
  minutes: number,
  ctx: Ctx = {},
): Promise<TaskDTO> {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new WorkTrackingValidationError("minutes must be a whole number between 1 and 1440.");
  }
  const before = await prisma.intakeTicketTask.findFirst({
    where: { id: taskId, ticket: { organizationId } },
    select: { id: true, ticketId: true, title: true, effortMinutes: true },
  });
  if (!before) throw new WorkItemNotFoundError("Task", taskId);

  const updated = await prisma.intakeTicketTask.update({
    where: { id: taskId },
    data: { effortMinutes: { increment: minutes } },
  });
  const actor = await getCurrentUser(ctx.req, ctx.res);
  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "intake.task.effort_logged",
    resourceType: "IntakeTicket",
    resourceId: before.ticketId,
    afterJson: {
      taskId,
      taskTitle: before.title,
      minutes,
      totalMinutes: updated.effortMinutes,
    },
  });
  return toTaskDTO(updated);
}
