/**
 * Unit tests for the bulk-operations service (sub-PR 4c.3, Item 6).
 *
 * The full bulk paths require a Postgres connection (they wrap
 * real per-custodian writes in `$transaction`). Here we test the
 * service's argument validation and the per-call delegation
 * behaviour by mocking prisma + the underlying single-custodian
 * services at the module boundary.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const transactionMock = vi.fn(async (fn: () => Promise<unknown>) => fn());
const markAckMock = vi.fn();
const partiallyReleaseMock = vi.fn();
const composeAndSendMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: { $transaction: transactionMock },
}));

vi.mock("../src/internal/legal-hold/services/acknowledgment", () => ({
  markCustodianAcknowledgedByAdminService: markAckMock,
}));

vi.mock("../src/internal/legal-hold/services/lifecycle", () => ({
  partiallyReleaseCustodianService: partiallyReleaseMock,
}));

vi.mock("../src/internal/legal-hold/services/notice-composer", () => ({
  composeAndSendNoticeService: composeAndSendMock,
}));

const {
  bulkMarkAcknowledgedService,
  bulkReleaseCustodiansService,
  bulkSendReminderService,
} = await import("../src/internal/legal-hold/services/bulk");

const ACTOR = {
  id: "u1",
  organizationId: "org1",
  type: "USER" as const,
};

beforeEach(() => {
  transactionMock.mockClear();
  markAckMock.mockReset();
  partiallyReleaseMock.mockReset();
  composeAndSendMock.mockReset();
});

describe("bulkMarkAcknowledgedService", () => {
  it("rejects an empty personIds array", async () => {
    await expect(
      bulkMarkAcknowledgedService(
        { holdId: "h1", personIds: [], reason: "x" },
        ACTOR,
      ),
    ).rejects.toThrow(/at least one custodian/);
  });

  it("rejects a missing reason", async () => {
    await expect(
      bulkMarkAcknowledgedService(
        { holdId: "h1", personIds: ["p1"], reason: "  " },
        ACTOR,
      ),
    ).rejects.toThrow(/reason required/);
  });

  it("delegates one call per personId with the shared reason", async () => {
    markAckMock.mockResolvedValue({});
    const result = await bulkMarkAcknowledgedService(
      {
        holdId: "h1",
        personIds: ["p1", "p2", "p3"],
        reason: "Verbal ack on Q2 call",
      },
      ACTOR,
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(markAckMock).toHaveBeenCalledTimes(3);
    expect(markAckMock.mock.calls[0]?.[0]).toMatchObject({
      holdId: "h1",
      personId: "p1",
      reason: "Verbal ack on Q2 call",
    });
    expect(result).toEqual({
      ok: true,
      total: 3,
      succeeded: 3,
      failed: 0,
      outcomes: expect.any(Array),
    });
  });

  it("rolls back the transaction when any per-row write throws", async () => {
    markAckMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("ack failed"));
    await expect(
      bulkMarkAcknowledgedService(
        {
          holdId: "h1",
          personIds: ["p1", "p2", "p3"],
          reason: "test",
        },
        ACTOR,
      ),
    ).rejects.toThrow(/ack failed/);
  });
});

describe("bulkReleaseCustodiansService", () => {
  it("rejects an empty personIds array", async () => {
    await expect(
      bulkReleaseCustodiansService(
        { holdId: "h1", personIds: [], releaseReason: "x" },
        ACTOR,
      ),
    ).rejects.toThrow(/at least one custodian/);
  });

  it("rejects a missing release reason", async () => {
    await expect(
      bulkReleaseCustodiansService(
        { holdId: "h1", personIds: ["p1"], releaseReason: "" },
        ACTOR,
      ),
    ).rejects.toThrow(/releaseReason required/);
  });

  it("delegates to partiallyReleaseCustodianService for each id", async () => {
    partiallyReleaseMock.mockResolvedValue({});
    const result = await bulkReleaseCustodiansService(
      {
        holdId: "h1",
        personIds: ["p1", "p2"],
        releaseReason: "Matter closeout",
      },
      ACTOR,
    );
    expect(partiallyReleaseMock).toHaveBeenCalledTimes(2);
    expect(partiallyReleaseMock.mock.calls[0]?.[0]).toMatchObject({
      holdId: "h1",
      personId: "p1",
      releaseReason: "Matter closeout",
    });
    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(2);
  });
});

describe("bulkSendReminderService", () => {
  it("rejects an empty personIds array", async () => {
    await expect(
      bulkSendReminderService(
        { holdId: "h1", templateId: "t1", personIds: [] },
        ACTOR,
      ),
    ).rejects.toThrow(/at least one custodian/);
  });

  it("delegates to composeAndSendNoticeService once with the recipient subset", async () => {
    composeAndSendMock.mockResolvedValue({
      issuance: { id: "iss-1" },
      recipientCount: 2,
      deliveryStubbed: true,
    });
    const result = await bulkSendReminderService(
      {
        holdId: "h1",
        templateId: "t1",
        personIds: ["p1", "p2"],
      },
      ACTOR,
    );
    expect(composeAndSendMock).toHaveBeenCalledTimes(1);
    expect(composeAndSendMock.mock.calls[0]?.[0]).toMatchObject({
      holdId: "h1",
      templateId: "t1",
      recipientCustodianPersonIds: ["p1", "p2"],
    });
    expect(result).toEqual({
      issuanceId: "iss-1",
      recipientCount: 2,
      deliveryStubbed: true,
    });
  });
});
