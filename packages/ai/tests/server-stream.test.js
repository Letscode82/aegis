import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamAnthropicMessages } from "../src/server.js";

const enc = new TextEncoder();

// A fake fetch Response whose body streams the given string chunks (as the
// reader would), so we can exercise SSE frame parsing across chunk boundaries.
function streamResp(chunks, status = 200) {
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader() {
        return {
          read: async () =>
            i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined },
        };
      },
    },
    text: async () => "",
  };
}

const DELTA = (t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })}\n\n`;

describe("streamAnthropicMessages", () => {
  const origKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origKey;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws a 500 'not configured' error when the key is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(streamAnthropicMessages({ model: "m", messages: [] })).rejects.toMatchObject({ status: 500 });
  });

  it("concatenates text deltas and fires onText per delta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResp([DELTA("Hello "), DELTA("world"), "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"])));
    const seen = [];
    const full = await streamAnthropicMessages(
      { model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }] },
      { onText: (t) => seen.push(t) },
    );
    expect(full).toBe("Hello world");
    expect(seen).toEqual(["Hello ", "world"]);
  });

  it("parses frames split across chunk boundaries", async () => {
    // One SSE frame delivered in three arbitrary byte chunks.
    const frame = DELTA("partial-ok");
    const a = frame.slice(0, 10);
    const b = frame.slice(10, 25);
    const c = frame.slice(25);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResp([a, b, c])));
    const full = await streamAnthropicMessages({ model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }] });
    expect(full).toBe("partial-ok");
  });

  it("throws on an upstream error event", async () => {
    const errFrame = `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResp([DELTA("x"), errFrame])));
    await expect(
      streamAnthropicMessages({ model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/Overloaded/);
  });

  it("throws with status + body on a non-2xx open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, body: null, text: async () => "invalid x-api-key" }));
    await expect(
      streamAnthropicMessages({ model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
