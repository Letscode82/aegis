/**
 * Outlook connector Graph mapper (C-2) — the pure `/messages` → intake-shape
 * transform. No network, no DB.
 */
import { describe, expect, it } from "vitest";
import { mapGraphMessages } from "../lib/connectors/outlook-graph";

describe("mapGraphMessages", () => {
  it("maps a Graph message collection to InboundGraphMessage shape", () => {
    const value = [
      {
        id: "AAMk-1",
        internetMessageId: "<abc@contoso.com>",
        conversationId: "conv-1",
        from: { emailAddress: { name: "Dana Lee", address: "dana@acme.com" } },
        subject: "NDA please",
        body: { content: "We need a mutual NDA.", contentType: "text" },
        bodyPreview: "We need a mutual NDA.",
        receivedDateTime: "2026-10-03T09:00:00Z",
        hasAttachments: true,
      },
    ];
    const [m] = mapGraphMessages(value);
    expect(m).toEqual({
      id: "AAMk-1",
      internetMessageId: "<abc@contoso.com>",
      conversationId: "conv-1",
      fromName: "Dana Lee",
      fromEmail: "dana@acme.com",
      subject: "NDA please",
      bodyText: "We need a mutual NDA.",
      receivedDateTime: "2026-10-03T09:00:00Z",
      hasAttachments: true,
    });
  });

  it("falls back to bodyPreview and tolerates missing fields", () => {
    const m = mapGraphMessages([
      { id: "x", subject: "Hi", bodyPreview: "preview only", receivedDateTime: "2026-10-03T10:00:00Z" },
    ])[0]!;
    expect(m.bodyText).toBe("preview only");
    expect(m.internetMessageId).toBeNull();
    expect(m.conversationId).toBeNull();
    expect(m.fromName).toBeNull();
    expect(m.fromEmail).toBeNull();
    expect(m.hasAttachments).toBe(false);
  });

  it("returns [] for a non-array (e.g. a Graph error payload)", () => {
    expect(mapGraphMessages(undefined)).toEqual([]);
    expect(mapGraphMessages({ error: "boom" })).toEqual([]);
  });
});
