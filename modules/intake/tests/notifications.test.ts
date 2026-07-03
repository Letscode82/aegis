/**
 * W3-2 (notifications, issue #114) — templates, prefs, and dispatch.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ticketFindFirstMock = vi.fn();
const mailboxFindFirstMock = vi.fn();
const prefFindUniqueMock = vi.fn();
const prefUpsertMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("@aegis/db", () => ({
  prisma: {
    intakeTicket: { findFirst: ticketFindFirstMock },
    intakeEmailMailbox: { findFirst: mailboxFindFirstMock },
    userPreference: { findUnique: prefFindUniqueMock, upsert: prefUpsertMock },
  },
  logAudit: logAuditMock,
}));
vi.mock("@aegis/matter", () => ({
  sendDelegatedMail: vi.fn().mockRejectedValue(new Error("no delegated auth")),
}));

const { buildNotificationEmail, normalizePrefs, prefAllows, toSnippet } =
  await import("../src/notifications/templates");
const { notifyTicketEvent } = await import("../src/notifications/server");

const TICKET = {
  id: "REQ-7001",
  type: "NDA Request",
  priority: "High",
  stage: "review",
  status: "IN_REVIEW",
  slaHours: 8,
  description: "Mutual NDA with Acme Robotics for the Q3 pilot",
  requester: { userId: "u-req", name: "Dana Lee", email: "dana@acme.example" },
  assignedToUser: { id: "u-maya", name: "Maya Chen", email: "maya@corp.example" },
};

beforeEach(() => {
  ticketFindFirstMock.mockReset().mockResolvedValue(TICKET);
  mailboxFindFirstMock.mockReset().mockResolvedValue({ address: "legal-intake@corp.example" });
  prefFindUniqueMock.mockReset().mockResolvedValue(null); // no row → all on
  prefUpsertMock.mockReset();
  logAuditMock.mockReset().mockResolvedValue(undefined);
});

describe("templates + prefs (pure)", () => {
  it("builds kind-specific subjects", () => {
    const ctx = {
      ticketId: "REQ-1",
      descSnippet: "NDA with Acme",
      type: "NDA Request",
      priority: "High",
      stage: "review",
      status: "CLOSED",
      slaHours: 8,
    };
    expect(buildNotificationEmail("assignment", ctx).subject).toContain("Assigned to you");
    expect(buildNotificationEmail("stage", ctx).subject).toContain("Update on your request");
    expect(buildNotificationEmail("breach", ctx).subject).toContain("SLA breached");
    expect(buildNotificationEmail("closure", ctx).subject).toContain("Resolved");
  });

  it("normalizes missing prefs to all-on and honors the master switch", () => {
    const dflt = normalizePrefs(null);
    expect(dflt).toEqual({ enabled: true, assignment: true, stage: true, breach: true, closure: true });
    expect(prefAllows(dflt, "assignment")).toBe(true);
    const masterOff = normalizePrefs({ enabled: false });
    expect(prefAllows(masterOff, "assignment")).toBe(false);
    const oneOff = normalizePrefs({ stage: false });
    expect(prefAllows(oneOff, "stage")).toBe(false);
    expect(prefAllows(oneOff, "closure")).toBe(true);
  });

  it("snips descriptions to one line", () => {
    expect(toSnippet("line one\nline   two")).toBe("line one line two");
    expect(toSnippet("x".repeat(200)).length).toBe(90);
  });
});

describe("notifyTicketEvent — dispatch", () => {
  it("assignment goes to the assignee and delivers via the org mailbox", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await notifyTicketEvent(
      { organizationId: "org1", ticketId: "REQ-7001", kind: "assignment" },
      { send },
    );
    expect(result).toEqual({ attempted: 1, delivered: 1, skipped: 0 });
    expect(send).toHaveBeenCalledWith("org1", expect.objectContaining({
      mailbox: "legal-intake@corp.example",
      to: "maya@corp.example",
      subject: expect.stringContaining("Assigned to you"),
    }));
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      actorType: "SYSTEM",
      action: "intake.notification.sent",
      resourceId: "REQ-7001",
      afterJson: expect.objectContaining({ kind: "assignment", to: "maya@corp.example", delivered: true }),
    });
  });

  it("closure goes to the requester", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await notifyTicketEvent(
      { organizationId: "org1", ticketId: "REQ-7001", kind: "closure" },
      { send },
    );
    expect(send.mock.calls[0][1].to).toBe("dana@acme.example");
  });

  it("records without delivering when no mailbox is configured", async () => {
    mailboxFindFirstMock.mockResolvedValue(null);
    const send = vi.fn();
    const result = await notifyTicketEvent(
      { organizationId: "org1", ticketId: "REQ-7001", kind: "breach" },
      { send },
    );
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 1, delivered: 0, skipped: 0 });
    expect(logAuditMock.mock.calls[0][0].afterJson).toMatchObject({
      delivered: false,
      reason: "no-mailbox",
    });
  });

  it("skips silently when the recipient turned the kind off", async () => {
    prefFindUniqueMock.mockResolvedValue({ value: { assignment: false } });
    const send = vi.fn();
    const result = await notifyTicketEvent(
      { organizationId: "org1", ticketId: "REQ-7001", kind: "assignment" },
      { send },
    );
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 0, delivered: 0, skipped: 1 });
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("records the failure reason when the send throws", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Graph sendMail failed (HTTP 403)"));
    const result = await notifyTicketEvent(
      { organizationId: "org1", ticketId: "REQ-7001", kind: "assignment" },
      { send },
    );
    expect(result).toEqual({ attempted: 1, delivered: 0, skipped: 0 });
    expect(logAuditMock.mock.calls[0][0].afterJson).toMatchObject({
      delivered: false,
      reason: expect.stringContaining("HTTP 403"),
    });
  });

  it("never throws — even when the ticket lookup explodes", async () => {
    ticketFindFirstMock.mockRejectedValue(new Error("db down"));
    await expect(
      notifyTicketEvent({ organizationId: "org1", ticketId: "REQ-7001", kind: "stage" }),
    ).resolves.toEqual({ attempted: 0, delivered: 0, skipped: 0 });
  });

  it("does nothing for an assignment event with no assignee", async () => {
    ticketFindFirstMock.mockResolvedValue({ ...TICKET, assignedToUser: null });
    const send = vi.fn();
    const result = await notifyTicketEvent(
      { organizationId: "org1", ticketId: "REQ-7001", kind: "assignment" },
      { send },
    );
    expect(result).toEqual({ attempted: 0, delivered: 0, skipped: 0 });
    expect(logAuditMock).not.toHaveBeenCalled();
  });
});
