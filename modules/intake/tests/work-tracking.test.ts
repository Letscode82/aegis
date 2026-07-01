/**
 * Intake work-tracking (Phase 1 item 2) — delivery layer: assignments,
 * sub-tasks, and a workStatus distinct from the request status. Every
 * mutation is org-scoped via the ticket and audited.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ticketFindFirst = vi.fn();
const ticketUpdate = vi.fn();
const asgFindMany = vi.fn();
const asgCreate = vi.fn();
const asgFindFirst = vi.fn();
const asgDelete = vi.fn();
const taskFindMany = vi.fn();
const taskCreate = vi.fn();
const taskFindFirst = vi.fn();
const taskUpdate = vi.fn();
const taskDelete = vi.fn();
const logAuditMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicket: { findFirst: ticketFindFirst, update: ticketUpdate },
    intakeTicketAssignment: { findMany: asgFindMany, create: asgCreate, findFirst: asgFindFirst, delete: asgDelete },
    intakeTicketTask: { findMany: taskFindMany, create: taskCreate, findFirst: taskFindFirst, update: taskUpdate, delete: taskDelete },
  },
  logAudit: logAuditMock,
  getCurrentUser: getUserMock,
}));

const {
  getTicketDelivery,
  addAssignment,
  removeAssignment,
  addTask,
  updateTask,
  removeTask,
  setWorkStatus,
  TicketNotFoundError,
  WorkItemNotFoundError,
  WorkTrackingValidationError,
} = await import("../src/work-tracking/server");

beforeEach(() => {
  ticketFindFirst.mockReset().mockResolvedValue({ id: "REQ-1", workStatus: null });
  ticketUpdate.mockReset().mockResolvedValue({});
  asgFindMany.mockReset().mockResolvedValue([]);
  asgCreate.mockReset();
  asgFindFirst.mockReset();
  asgDelete.mockReset().mockResolvedValue({});
  taskFindMany.mockReset().mockResolvedValue([]);
  taskCreate.mockReset();
  taskFindFirst.mockReset();
  taskUpdate.mockReset();
  taskDelete.mockReset().mockResolvedValue({});
  logAuditMock.mockReset().mockResolvedValue("a1");
  getUserMock.mockReset().mockResolvedValue({ id: "u-admin", name: "Admin" });
});

describe("work-tracking", () => {
  it("404s when the ticket is not in the org", async () => {
    ticketFindFirst.mockResolvedValue(null);
    await expect(getTicketDelivery("org1", "nope")).rejects.toBeInstanceOf(TicketNotFoundError);
    await expect(addAssignment("org1", "nope", { userId: "u1" })).rejects.toBeInstanceOf(TicketNotFoundError);
  });

  it("adds an assignment (role) and audits", async () => {
    asgCreate.mockResolvedValue({ id: "as-1", userId: "u9", role: "lead", assignedAt: new Date("2026-07-01T00:00:00Z"), assignedById: "u-admin" });
    const a = await addAssignment("org1", "REQ-1", { userId: "u9", role: "lead" });
    expect(a.userId).toBe("u9");
    expect(a.role).toBe("lead");
    expect(asgCreate.mock.calls[0][0].data).toMatchObject({ ticketId: "REQ-1", userId: "u9", role: "lead", assignedById: "u-admin" });
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.assignment_added");
  });

  it("rejects an assignment without userId", async () => {
    await expect(addAssignment("org1", "REQ-1", { userId: "" })).rejects.toBeInstanceOf(WorkTrackingValidationError);
    expect(asgCreate).not.toHaveBeenCalled();
  });

  it("removes an assignment scoped to the org and audits", async () => {
    asgFindFirst.mockResolvedValue({ id: "as-1", ticketId: "REQ-1", userId: "u9", role: "lead" });
    await removeAssignment("org1", "as-1");
    expect(asgDelete).toHaveBeenCalledWith({ where: { id: "as-1" } });
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.assignment_removed");
    // scoped via ticket.organizationId
    expect(asgFindFirst.mock.calls[0][0].where.ticket.organizationId).toBe("org1");
  });

  it("adds a task and updates its status with validation", async () => {
    taskCreate.mockResolvedValue({ id: "t1", title: "Draft answer", description: null, assigneeUserId: "u9", status: "open", sortOrder: 100 });
    const t = await addTask("org1", "REQ-1", { title: "Draft answer", assigneeUserId: "u9" });
    expect(t.status).toBe("open");
    expect(logAuditMock.mock.calls[0][0].action).toBe("intake.ticket.task_added");

    taskFindFirst.mockResolvedValue({ id: "t1", ticketId: "REQ-1", status: "open", assigneeUserId: "u9" });
    await expect(updateTask("org1", "t1", { status: "bogus" })).rejects.toBeInstanceOf(WorkTrackingValidationError);

    taskUpdate.mockResolvedValue({ id: "t1", title: "Draft answer", description: null, assigneeUserId: "u9", status: "done", sortOrder: 100 });
    const u = await updateTask("org1", "t1", { status: "done" });
    expect(u.status).toBe("done");
    expect(logAuditMock.mock.calls.some((c) => c[0].action === "intake.ticket.task_updated")).toBe(true);
  });

  it("404s updating a task outside the org", async () => {
    taskFindFirst.mockResolvedValue(null);
    await expect(updateTask("org1", "missing", { status: "done" })).rejects.toBeInstanceOf(WorkItemNotFoundError);
  });

  it("sets workStatus and audits only on change", async () => {
    ticketFindFirst.mockResolvedValue({ id: "REQ-1", workStatus: "Not started" });
    await setWorkStatus("org1", "REQ-1", "In progress");
    expect(ticketUpdate).toHaveBeenCalledWith({ where: { id: "REQ-1" }, data: { workStatus: "In progress" } });
    expect(logAuditMock.mock.calls.some((c) => c[0].action === "intake.ticket.work_status_changed")).toBe(true);

    // No-op when unchanged.
    logAuditMock.mockClear();
    ticketUpdate.mockClear();
    ticketFindFirst.mockResolvedValue({ id: "REQ-1", workStatus: "In progress" });
    await setWorkStatus("org1", "REQ-1", "In progress");
    expect(ticketUpdate).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("assembles the delivery view (workStatus + assignments + tasks)", async () => {
    ticketFindFirst.mockResolvedValue({ id: "REQ-1", workStatus: "In progress" });
    asgFindMany.mockResolvedValue([{ id: "as-1", userId: "u9", role: "lead", assignedAt: new Date("2026-07-01T00:00:00Z"), assignedById: "u-admin" }]);
    taskFindMany.mockResolvedValue([{ id: "t1", title: "Draft", description: null, assigneeUserId: "u9", status: "open", sortOrder: 10 }]);
    const d = await getTicketDelivery("org1", "REQ-1");
    expect(d.workStatus).toBe("In progress");
    expect(d.assignments).toHaveLength(1);
    expect(d.tasks[0].title).toBe("Draft");
  });
});
