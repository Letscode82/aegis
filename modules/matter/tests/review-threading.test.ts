import { describe, it, expect } from "vitest";
import { normalizeSubject, assignThreadingAndDedup } from "../src/internal/services/review-threading";

describe("normalizeSubject", () => {
  it("strips reply/forward prefixes and normalizes", () => {
    expect(normalizeSubject("RE: FW:  Snowflake  MSA")).toBe("snowflake msa");
    expect(normalizeSubject("Fwd: Re: Re: Deal")).toBe("deal");
    expect(normalizeSubject("Plain")).toBe("plain");
  });
});

describe("assignThreadingAndDedup", () => {
  it("groups a conversation and marks the latest as inclusive", () => {
    const a = assignThreadingAndDedup([
      { id: "1", subject: "Deal", body: "first", conversationId: "C1", sentAt: "2026-01-01T00:00:00Z" },
      { id: "2", subject: "RE: Deal", body: "second", conversationId: "C1", sentAt: "2026-01-03T00:00:00Z" },
      { id: "3", subject: "RE: Deal", body: "third", conversationId: "C1", sentAt: "2026-01-02T00:00:00Z" },
    ]);
    expect(a.get("1")!.threadId).toBe(a.get("2")!.threadId);
    expect(a.get("1")!.threadId).toBe(a.get("3")!.threadId);
    expect(a.get("2")!.isInclusive).toBe(true); // latest sentAt
    expect(a.get("1")!.isInclusive).toBe(false);
    expect(a.get("3")!.isInclusive).toBe(false);
  });
  it("threads by normalized subject when no conversationId", () => {
    const a = assignThreadingAndDedup([
      { id: "1", subject: "Pricing", sentAt: "2026-01-01T00:00:00Z" },
      { id: "2", subject: "Re: Pricing", sentAt: "2026-01-02T00:00:00Z" },
    ]);
    expect(a.get("1")!.threadId).toBe(a.get("2")!.threadId);
    expect(a.get("2")!.isInclusive).toBe(true);
  });
  it("gives identical messages the same dedupKey and distinct ones different keys", () => {
    const a = assignThreadingAndDedup([
      { id: "1", subject: "Invoice", body: "same body text" },
      { id: "2", subject: "Invoice", body: "same body text" },
      { id: "3", subject: "Invoice", body: "different body" },
    ]);
    expect(a.get("1")!.dedupKey).toBe(a.get("2")!.dedupKey);
    expect(a.get("1")!.dedupKey).not.toBe(a.get("3")!.dedupKey);
  });
  it("a single-message thread is inclusive", () => {
    const a = assignThreadingAndDedup([{ id: "solo", subject: "Only" }]);
    expect(a.get("solo")!.isInclusive).toBe(true);
  });
});
