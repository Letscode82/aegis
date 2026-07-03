/**
 * W3-5 (effort capture, issue #117) — logTaskEffort service.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const taskFindFirstMock = vi.fn();
const taskUpdateMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicketTask: { findFirst: taskFindFirstMock, update: taskUpdateMock },
    intakeTicket: { findFirst: vi.fn() },
    intakeTicketAssignment: { findMany: vi.fn() },
  },
  logAudit: logAuditMock,
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u-maya", name: "Maya" }),
}));

const { logTaskEffort, WorkTrackingValidationError, WorkItemNotFoundError } =
  await import("../src/work-tracking/server");

beforeEach(() => {
  taskFindFirstMock.mockReset().mockResolvedValue({
    id: "task-1",
    ticketId: "REQ-1",
    title: "Draft the NDA",
    effortMinutes: 30,
  });
  taskUpdateMock.mockReset().mockResolvedValue({
    id: "task-1",
    title: "Draft the NDA",
    description: null,
    assigneeUserId: "u-maya",
    status: "in_progress",
    sortOrder: 100,
    effortMinutes: 75,
  });
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("logTaskEffort", () => {
  it("increments the total and audits the entry with both numbers", async () => {
    const task = await logTaskEffort("org1", "task-1", 45);
    expect(taskUpdateMock).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { effortMinutes: { increment: 45 } },
    });
    expect(task.effortMinutes).toBe(75);
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      actorId: "u-maya",
      action: "intake.task.effort_logged",
      resourceType: "IntakeTicket",
      resourceId: "REQ-1",
      afterJson: {
        taskId: "task-1",
        taskTitle: "Draft the NDA",
        minutes: 45,
        totalMinutes: 75,
      },
    });
  });

  it("rejects non-integer, zero, negative, and absurd values", async () => {
    for (const bad of [0, -15, 2.5, NaN, 1441]) {
      await expect(logTaskEffort("org1", "task-1", bad)).rejects.toBeInstanceOf(
        WorkTrackingValidationError,
      );
    }
    expect(taskUpdateMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("404s for a task outside the org", async () => {
    taskFindFirstMock.mockResolvedValue(null);
    await expect(logTaskEffort("org1", "task-x", 15)).rejects.toBeInstanceOf(
      WorkItemNotFoundError,
    );
  });
});
