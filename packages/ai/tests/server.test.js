import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAnthropicMessages } from "../src/server.js";

// Minimal fake fetch Response.
function resp(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

const OK_BODY = { content: [{ type: "text", text: "hi" }] };

describe("callAnthropicMessages", () => {
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

  it("throws a 500 'not configured' error when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callAnthropicMessages({ model: "m", messages: [] })).rejects.toMatchObject({ status: 500 });
  });

  it("retries a transient 529 overload and then succeeds (REL1)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(529, "overloaded"))
      .mockResolvedValueOnce(resp(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const out = await callAnthropicMessages({ model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }] });
    expect(out).toEqual(OK_BODY);
    expect(fetchMock).toHaveBeenCalledTimes(2); // first 529, retry succeeds
  });

  it("surfaces a non-retryable 401 with status + body (no retry) and logs it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resp(401, "invalid x-api-key"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      callAnthropicMessages({ model: "claude-sonnet-5", messages: [{ role: "user", content: "x" }] })
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // 401 is not retryable
    expect(console.error).toHaveBeenCalled(); // reason is logged for diagnosability
  });
});
