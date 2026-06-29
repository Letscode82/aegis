/**
 * @aegis/ai server transport seam. When a transport is installed,
 * callClaude routes through it instead of the relative-URL fetch (which
 * only works in a browser) — this is what lets the agents run server-side.
 */
import { describe, expect, it, afterEach } from "vitest";
import { callClaude, callClaudeJSON, setClaudeTransport } from "@aegis/ai";

afterEach(() => setClaudeTransport(null)); // don't leak the transport

describe("setClaudeTransport()", () => {
  it("routes callClaude through the injected transport", async () => {
    let seenBody: any;
    setClaudeTransport(async (body) => {
      seenBody = body;
      return { content: [{ type: "text", text: "drafted reply" }] };
    });
    const out = await callClaude("Write an NDA", { maxTokens: 200 });
    expect(out).toBe("drafted reply");
    // The Anthropic request body was assembled and handed to the transport.
    expect(seenBody.model).toBeTruthy();
    expect(seenBody.messages[0].content).toBe("Write an NDA");
  });

  it("parses JSON from the transport via callClaudeJSON", async () => {
    setClaudeTransport(async () => ({
      content: [{ type: "text", text: '```json\n{"suggestedAction":"approve-and-send","confidence":0.9}\n```' }],
    }));
    const obj = await callClaudeJSON("classify this");
    expect(obj.suggestedAction).toBe("approve-and-send");
    expect(obj.confidence).toBe(0.9);
  });

  it("throws when the transport returns no text block", async () => {
    setClaudeTransport(async () => ({ content: [] }));
    await expect(callClaude("x")).rejects.toThrow(/No text block/);
  });
});
