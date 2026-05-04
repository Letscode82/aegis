/**
 * Unit tests for trigger event services (sub-PR 4c.4, Item 9).
 *
 * The full mutation paths require Postgres + the chain trigger;
 * here we validate argument handling and the cross-org guard by
 * mocking prisma + recordHoldEvent at the module boundary.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const findFirstMock = vi.fn();
const updateTriggerMock = vi.fn();
const updateHoldMock = vi.fn();
const recordHoldEventMock = vi.fn();
const findFirstHoldMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    legalHold: {
      findFirst: findFirstHoldMock,
      update: updateHoldMock,
    },
    holdTriggerEvent: {
      findFirst: findFirstMock,
      update: updateTriggerMock,
    },
  },
}));

vi.mock("../src/internal/legal-hold/services/timeline", () => ({
  recordHoldEvent: recordHoldEventMock,
}));

const { updateHoldTriggerService, getHoldTriggerEventService } = await import(
  "../src/internal/legal-hold/services/trigger"
);

const ACTOR = { id: "u1", organizationId: "org1", type: "USER" as const };

beforeEach(() => {
  findFirstMock.mockReset();
  updateTriggerMock.mockReset();
  updateHoldMock.mockReset();
  recordHoldEventMock.mockReset();
  findFirstHoldMock.mockReset();
});

describe("updateHoldTriggerService", () => {
  it("rejects an unknown trigger event id", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    await expect(
      updateHoldTriggerService(
        {
          holdId: "h1",
          triggerEventId: "missing",
          eventDescription: "x",
          occurredAt: new Date(),
        },
        ACTOR,
      ),
    ).rejects.toThrow(/Trigger event missing not found/);
    expect(updateTriggerMock).not.toHaveBeenCalled();
  });

  it("rejects cross-org access", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "t1",
      legalHoldId: "h1",
      eventDescription: "old",
      occurredAt: new Date("2026-01-01"),
      legalHold: { organizationId: "ANOTHER_ORG" },
    });
    await expect(
      updateHoldTriggerService(
        {
          holdId: "h1",
          triggerEventId: "t1",
          eventDescription: "x",
          occurredAt: new Date(),
        },
        ACTOR,
      ),
    ).rejects.toThrow(/Cross-org access refused/);
    expect(updateTriggerMock).not.toHaveBeenCalled();
  });

  it("updates trigger + hold + writes TRIGGER_UPDATED event", async () => {
    findFirstMock.mockResolvedValueOnce({
      id: "t1",
      legalHoldId: "h1",
      eventDescription: "old description",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
      legalHold: { organizationId: "org1" },
    });
    updateTriggerMock.mockResolvedValueOnce({});
    updateHoldMock.mockResolvedValueOnce({});
    recordHoldEventMock.mockResolvedValueOnce(undefined);

    await updateHoldTriggerService(
      {
        holdId: "h1",
        triggerEventId: "t1",
        eventDescription: "new description",
        occurredAt: new Date("2026-02-15T00:00:00Z"),
      },
      ACTOR,
    );

    expect(updateTriggerMock).toHaveBeenCalledTimes(1);
    expect(updateHoldMock).toHaveBeenCalledTimes(1);
    expect(updateHoldMock.mock.calls[0]?.[0]?.data).toMatchObject({
      triggeredAt: new Date("2026-02-15T00:00:00Z"),
      triggerEventDescription: "new description",
    });
    expect(recordHoldEventMock).toHaveBeenCalledTimes(1);
    const eventArg = recordHoldEventMock.mock.calls[0]?.[0];
    expect(eventArg.type).toBe("TRIGGER_UPDATED");
    expect(eventArg.beforeJson).toMatchObject({
      eventDescription: "old description",
    });
    expect(eventArg.afterJson).toMatchObject({
      eventDescription: "new description",
    });
  });
});

describe("getHoldTriggerEventService", () => {
  it("returns null when the hold doesn't exist", async () => {
    findFirstHoldMock.mockResolvedValueOnce(null);
    expect(await getHoldTriggerEventService("h1", "org1")).toBeNull();
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns null when no trigger has been recorded", async () => {
    findFirstHoldMock.mockResolvedValueOnce({ id: "h1" });
    findFirstMock.mockResolvedValueOnce(null);
    expect(await getHoldTriggerEventService("h1", "org1")).toBeNull();
  });

  it("serialises the most recent trigger to a DTO", async () => {
    findFirstHoldMock.mockResolvedValueOnce({ id: "h1" });
    findFirstMock.mockResolvedValueOnce({
      id: "t1",
      occurredAt: new Date("2026-01-15T00:00:00Z"),
      eventDescription: "Service of preservation letter",
      recordedById: "u1",
      recordedAt: new Date("2026-01-15T12:34:56Z"),
    });
    const result = await getHoldTriggerEventService("h1", "org1");
    expect(result).toEqual({
      id: "t1",
      occurredAt: "2026-01-15T00:00:00.000Z",
      eventDescription: "Service of preservation letter",
      recordedById: "u1",
      recordedAt: "2026-01-15T12:34:56.000Z",
    });
  });
});
