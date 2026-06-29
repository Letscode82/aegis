/**
 * Graph mail service (Intake P4b). Delegated read/send, audited. The HTTP
 * layer + the token fetch are injected/mocked so this runs offline.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const logAuditMock = vi.fn();
vi.mock("@aegis/db", () => ({
  logAudit: logAuditMock,
}));

const getTokenMock = vi.fn();
vi.mock("../src/internal/services/m365-graph-delegated-auth", () => ({
  getFreshDelegatedAccessToken: getTokenMock,
}));

const { pollDelegatedMailbox, sendDelegatedMail } = await import(
  "../src/internal/services/m365-graph-mail"
);

beforeEach(() => {
  logAuditMock.mockReset().mockResolvedValue("audit-1");
  getTokenMock.mockReset().mockResolvedValue({ accessToken: "tok-123", accountUpn: "svc@contoso.com" });
});

describe("pollDelegatedMailbox()", () => {
  it("maps Graph messages, strips HTML, and audits the call", async () => {
    const http = vi.fn().mockResolvedValue({
      status: 200,
      json: {
        value: [
          {
            id: "m1",
            internetMessageId: "<abc@contoso.com>",
            conversationId: "conv1",
            subject: "NDA for Acme Robotics",
            receivedDateTime: "2026-06-29T10:00:00Z",
            hasAttachments: false,
            from: { emailAddress: { name: "Dana Lee", address: "dana@acme.com" } },
            body: { contentType: "html", content: "<p>We need a <b>mutual NDA</b>.</p>" },
          },
          {
            id: "m2",
            internetMessageId: "<def@contoso.com>",
            conversationId: "conv2",
            subject: "Vendor question",
            receivedDateTime: "2026-06-29T11:00:00Z",
            hasAttachments: true,
            from: { emailAddress: { name: "Sam Roe", address: "sam@x.com" } },
            body: { contentType: "text", content: "Plain text body." },
          },
        ],
      },
    });

    const msgs = await pollDelegatedMailbox("org1", "legal-intake@contoso.com", {
      sinceIso: "2026-06-29T09:00:00Z",
      http,
    });

    expect(msgs).toHaveLength(2);
    expect(msgs[0].subject).toBe("NDA for Acme Robotics");
    expect(msgs[0].fromEmail).toBe("dana@acme.com");
    expect(msgs[0].bodyText).toContain("We need a mutual NDA.");
    expect(msgs[0].bodyText).not.toContain("<");
    expect(msgs[1].hasAttachments).toBe(true);

    // URL carries the delta filter + select + bearer token used.
    const call = http.mock.calls[0][0];
    expect(call.accessToken).toBe("tok-123");
    expect(call.url).toContain("/users/legal-intake%40contoso.com/messages");
    // URLSearchParams encodes spaces as "+" and ":" as %3A.
    expect(decodeURIComponent(call.url.replace(/\+/g, " "))).toContain(
      "receivedDateTime gt 2026-06-29T09:00:00Z",
    );

    // Audited as a delegated Graph call.
    const audit = logAuditMock.mock.calls.find((c) => c[0].action === "m365.graph.call");
    expect(audit).toBeTruthy();
    expect(audit![0].metadata.authMode).toBe("delegated");
  });

  it("throws (and audits failure) on a non-2xx Graph response", async () => {
    const http = vi.fn().mockResolvedValue({ status: 403, json: { error: "forbidden" } });
    await expect(
      pollDelegatedMailbox("org1", "mb@contoso.com", { http }),
    ).rejects.toThrow(/HTTP 403/);
    expect(logAuditMock.mock.calls.some((c) => c[0].action === "m365.graph.call.failed")).toBe(true);
  });
});

describe("sendDelegatedMail()", () => {
  it("posts a sendMail payload with In-Reply-To threading", async () => {
    const http = vi.fn().mockResolvedValue({ status: 202, json: null });
    await sendDelegatedMail(
      "org1",
      {
        mailbox: "legal-intake@contoso.com",
        to: "dana@acme.com",
        subject: "Re: NDA",
        body: "Thanks — drafting now.",
        inReplyToInternetMessageId: "<abc@contoso.com>",
      },
      { http },
    );
    const call = http.mock.calls[0][0];
    expect(call.method).toBe("POST");
    expect(call.url).toContain("/sendMail");
    expect(call.body.message.toRecipients[0].emailAddress.address).toBe("dana@acme.com");
    const headers = call.body.message.internetMessageHeaders;
    expect(headers.find((h: { name: string }) => h.name === "In-Reply-To").value).toBe("<abc@contoso.com>");
  });
});
