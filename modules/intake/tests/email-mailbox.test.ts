/**
 * Intake mailbox polling (P4b). A polled M365 message becomes an
 * IntakeTicket via the SAME ingest path as the P4a webhook; the
 * receivedDateTime watermark makes re-polling idempotent.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mailboxFindFirst = vi.fn();
const mailboxUpdate = vi.fn();
vi.mock("@aegis/db", () => ({
  prisma: {
    intakeEmailMailbox: { findFirst: mailboxFindFirst, update: mailboxUpdate },
  },
  logAudit: vi.fn(),
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u-1", name: "Admin" }),
}));

// Graph poller + sender are the matter module — mocked here.
vi.mock("@aegis/matter", () => ({ pollDelegatedMailbox: vi.fn(), sendDelegatedMail: vi.fn() }));

// The ingest path is exercised by its own tests; here we just confirm it
// is called once per message with the mapped fields.
const ingestMock = vi.fn();
vi.mock("../src/email/server", () => ({ ingestInboundEmail: ingestMock }));

const { pollMailboxForIntake } = await import("../src/email/mailbox");

const msg = (id: string, when: string, over: Record<string, unknown> = {}) => ({
  id,
  internetMessageId: `<${id}@x>`,
  conversationId: `conv-${id}`,
  fromName: "Dana Lee",
  fromEmail: "dana@acme.com",
  subject: `Subject ${id}`,
  bodyText: `Body ${id}`,
  receivedDateTime: when,
  hasAttachments: false,
  ...over,
});

beforeEach(() => {
  mailboxFindFirst.mockReset();
  mailboxUpdate.mockReset().mockResolvedValue({});
  ingestMock.mockReset().mockResolvedValue({ ticketId: "tkt-x" });
});

describe("pollMailboxForIntake()", () => {
  it("ingests each new message and advances the watermark", async () => {
    mailboxFindFirst.mockResolvedValue({
      id: "mb1",
      address: "legal@contoso.com",
      enabled: true,
      lastReceivedAt: new Date("2026-06-29T09:00:00Z"),
    });
    const { pollDelegatedMailbox } = await import("@aegis/matter");
    (pollDelegatedMailbox as ReturnType<typeof vi.fn>).mockResolvedValue([
      msg("a", "2026-06-29T10:00:00Z"),
      msg("b", "2026-06-29T11:30:00Z", { hasAttachments: true }),
    ]);

    const res = await pollMailboxForIntake("org1", "mb1");

    expect(res.polled).toBe(2);
    expect(res.created).toBe(2);
    expect(ingestMock).toHaveBeenCalledTimes(2);
    // Mapped fields + EMAIL channel context.
    const firstArg = ingestMock.mock.calls[0][0];
    expect(firstArg.subject).toBe("Subject a");
    expect(firstArg.fromEmail).toBe("dana@acme.com");
    expect(ingestMock.mock.calls[0][1].organizationId).toBe("org1");
    // Watermark advanced to the newest message.
    expect(res.watermark).toBe("2026-06-29T11:30:00.000Z");
    const update = mailboxUpdate.mock.calls.at(-1)![0].data;
    expect(update.lastError).toBeNull();
    expect(update.lastReceivedAt).toEqual(new Date("2026-06-29T11:30:00Z"));

    // The delta filter passed to Graph is the prior watermark.
    expect((pollDelegatedMailbox as ReturnType<typeof vi.fn>).mock.calls[0][2].sinceIso).toBe(
      "2026-06-29T09:00:00.000Z",
    );
  });

  it("skips a disabled mailbox without polling", async () => {
    mailboxFindFirst.mockResolvedValue({
      id: "mb1", address: "x@y.com", enabled: false, lastReceivedAt: null,
    });
    const res = await pollMailboxForIntake("org1", "mb1");
    expect(res.skipped).toBe("disabled");
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("records lastError and creates nothing when Graph fails", async () => {
    mailboxFindFirst.mockResolvedValue({
      id: "mb1", address: "x@y.com", enabled: true, lastReceivedAt: null,
    });
    const { pollDelegatedMailbox } = await import("@aegis/matter");
    (pollDelegatedMailbox as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("HTTP 403"));

    const res = await pollMailboxForIntake("org1", "mb1");
    expect(res.error).toMatch(/403/);
    expect(res.created).toBe(0);
    expect(ingestMock).not.toHaveBeenCalled();
    expect(mailboxUpdate.mock.calls.at(-1)![0].data.lastError).toMatch(/403/);
  });

  it("is a no-op (no new tickets) when Graph returns nothing", async () => {
    mailboxFindFirst.mockResolvedValue({
      id: "mb1", address: "x@y.com", enabled: true,
      lastReceivedAt: new Date("2026-06-29T09:00:00Z"),
    });
    const { pollDelegatedMailbox } = await import("@aegis/matter");
    (pollDelegatedMailbox as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await pollMailboxForIntake("org1", "mb1");
    expect(res.created).toBe(0);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("sends a threaded auto-acknowledgement when the mailbox opts in", async () => {
    mailboxFindFirst.mockResolvedValue({
      id: "mb1", address: "legal@contoso.com", enabled: true,
      autoAckEnabled: true, lastReceivedAt: null,
    });
    const { pollDelegatedMailbox } = await import("@aegis/matter");
    (pollDelegatedMailbox as ReturnType<typeof vi.fn>).mockResolvedValue([
      msg("a", "2026-06-29T10:00:00Z"),
    ]);
    ingestMock.mockResolvedValue({ ticketId: "REQ-9", deduped: false });
    const sendMail = vi.fn().mockResolvedValue(undefined);

    const res = await pollMailboxForIntake("org1", "mb1", { sendMail });

    expect(res.acknowledged).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const [, mail] = sendMail.mock.calls[0];
    expect(mail.to).toBe("dana@acme.com");
    expect(mail.mailbox).toBe("legal@contoso.com");
    expect(mail.inReplyToInternetMessageId).toBe("<a@x>");
    expect(mail.body).toContain("REQ-9");
  });

  it("does NOT auto-ack a deduped redelivery", async () => {
    mailboxFindFirst.mockResolvedValue({
      id: "mb1", address: "legal@contoso.com", enabled: true,
      autoAckEnabled: true, lastReceivedAt: null,
    });
    const { pollDelegatedMailbox } = await import("@aegis/matter");
    (pollDelegatedMailbox as ReturnType<typeof vi.fn>).mockResolvedValue([
      msg("a", "2026-06-29T10:00:00Z"),
    ]);
    ingestMock.mockResolvedValue({ ticketId: "REQ-existing", deduped: true });
    const sendMail = vi.fn().mockResolvedValue(undefined);

    const res = await pollMailboxForIntake("org1", "mb1", { sendMail });
    expect(res.created).toBe(0);
    expect(res.acknowledged).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
