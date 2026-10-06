/**
 * Unit tests for the CW-5 RFI round-trip service.
 *
 * Prisma + logAudit + getCurrentUser are mocked at the module boundary;
 * the tests exercise send / answer / cancel transitions, the one-open-at-a-
 * time guard, and the requester self-scope on answer.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const rfiFindMany = vi.fn();
const rfiFindFirst = vi.fn();
const rfiCreate = vi.fn();
const rfiUpdate = vi.fn();
const ticketFindFirst = vi.fn();
const logAudit = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeRfi: {
      findMany: rfiFindMany,
      findFirst: rfiFindFirst,
      create: rfiCreate,
      update: rfiUpdate,
    },
    intakeTicket: { findFirst: ticketFindFirst },
  },
  logAudit: (...args: unknown[]) => logAudit(...args),
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

const {
  sendRfi,
  answerRfi,
  cancelRfi,
  RfiValidationError,
  RfiForbiddenError,
  RfiNotFoundError,
} = await import("../src/internal/rfi/server");

const NOW = new Date("2026-10-05T09:00:00Z");
function rfiRow(over: Record<string, unknown> = {}) {
  return {
    id: "rfi1",
    ticketId: "REQ-1",
    status: "OPEN",
    question: "Which entity is the counterparty?",
    askedById: "u-rev",
    askedByName: "Rachel Adams",
    answer: null,
    answeredAt: null,
    answeredById: null,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

beforeEach(() => {
  rfiFindMany.mockReset();
  rfiFindFirst.mockReset();
  rfiCreate.mockReset();
  rfiUpdate.mockReset();
  ticketFindFirst.mockReset();
  logAudit.mockReset();
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: "u-rev", name: "Rachel Adams", email: "rachel@acme.test" });
});

describe("sendRfi()", () => {
  it("creates an OPEN rfi and writes intake.ticket.rfi_sent", async () => {
    ticketFindFirst.mockResolvedValueOnce({ id: "REQ-1" });
    rfiFindFirst.mockResolvedValueOnce(null); // no existing open
    rfiCreate.mockResolvedValueOnce(rfiRow());

    const out = await sendRfi("org1", "REQ-1", { question: "Which entity is the counterparty?" });
    expect(out.status).toBe("OPEN");
    expect(rfiCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: "org1", ticketId: "REQ-1", status: "OPEN", askedById: "u-rev" }) }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "intake.ticket.rfi_sent" }));
  });

  it("rejects a too-short question before any write", async () => {
    await expect(sendRfi("org1", "REQ-1", { question: " " })).rejects.toBeInstanceOf(RfiValidationError);
    expect(ticketFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a second open rfi on the same ticket", async () => {
    ticketFindFirst.mockResolvedValueOnce({ id: "REQ-1" });
    rfiFindFirst.mockResolvedValueOnce({ id: "rfi0" }); // one already open
    await expect(sendRfi("org1", "REQ-1", { question: "another question" })).rejects.toBeInstanceOf(RfiValidationError);
    expect(rfiCreate).not.toHaveBeenCalled();
  });
});

describe("answerRfi()", () => {
  it("lets the ticket's requester answer and flips to ANSWERED", async () => {
    ticketFindFirst.mockResolvedValueOnce({ id: "REQ-1", requesterId: "p-req", requester: { userId: "u-rev", email: "rachel@acme.test" } });
    rfiFindFirst.mockResolvedValueOnce(rfiRow());
    rfiUpdate.mockResolvedValueOnce(rfiRow({ status: "ANSWERED", answer: "Acme Corp.", answeredAt: NOW, answeredById: "p-req" }));

    const out = await answerRfi("org1", "REQ-1", "rfi1", { answer: "Acme Corp." });
    expect(out.status).toBe("ANSWERED");
    expect(rfiUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ANSWERED", answeredById: "p-req" }) }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "intake.ticket.rfi_answered" }));
  });

  it("forbids a non-requester from answering", async () => {
    ticketFindFirst.mockResolvedValueOnce({ id: "REQ-1", requesterId: "p-req", requester: { userId: "someone-else", email: "other@acme.test" } });
    await expect(answerRfi("org1", "REQ-1", "rfi1", { answer: "x" })).rejects.toBeInstanceOf(RfiForbiddenError);
    expect(rfiUpdate).not.toHaveBeenCalled();
  });

  it("404s when the rfi does not exist for the ticket", async () => {
    ticketFindFirst.mockResolvedValueOnce({ id: "REQ-1", requesterId: "p-req", requester: { userId: "u-rev", email: "rachel@acme.test" } });
    rfiFindFirst.mockResolvedValueOnce(null);
    await expect(answerRfi("org1", "REQ-1", "missing", { answer: "x" })).rejects.toBeInstanceOf(RfiNotFoundError);
  });

  it("rejects answering an rfi that is not OPEN", async () => {
    ticketFindFirst.mockResolvedValueOnce({ id: "REQ-1", requesterId: "p-req", requester: { userId: "u-rev", email: "rachel@acme.test" } });
    rfiFindFirst.mockResolvedValueOnce(rfiRow({ status: "CANCELLED" }));
    await expect(answerRfi("org1", "REQ-1", "rfi1", { answer: "x" })).rejects.toBeInstanceOf(RfiValidationError);
  });
});

describe("cancelRfi()", () => {
  it("cancels an OPEN rfi and audits intake.ticket.rfi_cancelled", async () => {
    rfiFindFirst.mockResolvedValueOnce(rfiRow());
    rfiUpdate.mockResolvedValueOnce(rfiRow({ status: "CANCELLED", cancelledAt: NOW }));
    const out = await cancelRfi("org1", "REQ-1", "rfi1");
    expect(out.status).toBe("CANCELLED");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "intake.ticket.rfi_cancelled" }));
  });

  it("rejects cancelling a non-OPEN rfi", async () => {
    rfiFindFirst.mockResolvedValueOnce(rfiRow({ status: "ANSWERED" }));
    await expect(cancelRfi("org1", "REQ-1", "rfi1")).rejects.toBeInstanceOf(RfiValidationError);
    expect(rfiUpdate).not.toHaveBeenCalled();
  });
});
