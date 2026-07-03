/**
 * W4-5 (observability, issue #122) — structured logs, request wrapper,
 * client-error sanitizer.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  logEvent,
  redactFields,
  captureError,
  withRequestLog,
  sanitizeClientError,
  slowRequestThresholdMs,
} from "@aegis/observability";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AEGIS_SLOW_REQUEST_MS;
});

describe("structured log lines", () => {
  it("emits one parseable JSON line with ts/level/kind", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("info", "request", { route: "/api/x", ms: 12 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: "info", kind: "request", route: "/api/x", ms: 12 });
    expect(typeof line.ts).toBe("string");
  });

  it("redacts secret-shaped keys", () => {
    expect(
      redactFields({ authorization: "Bearer x", apiKey: "k", route: "/ok" }),
    ).toEqual({ authorization: "[redacted]", apiKey: "[redacted]", route: "/ok" });
  });

  it("captureError clips the stack and logs an exception event", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureError(new Error("boom"), { route: "/api/x" });
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ kind: "exception", errorName: "Error", message: "boom" });
    expect((line.stack as string).split("\n").length).toBeLessThanOrEqual(8);
  });
});

function fakeRes() {
  const res = {
    statusCode: 200,
    headersSent: false,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return { json: (b: unknown) => { res.body = b; res.headersSent = true; } };
    },
  };
  return res;
}

describe("withRequestLog", () => {
  it("logs one request line with method/route/status/ms", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = withRequestLog(async (_req, res) => {
      res.status(200).json({ ok: true });
    }, "/api/test");
    await handler({ method: "GET", url: "/api/test?secret=1", headers: {} }, fakeRes());
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ kind: "request", method: "GET", route: "/api/test", status: 200 });
    expect(typeof line.ms).toBe("number");
    expect(typeof line.requestId).toBe("string");
  });

  it("flags slow requests past the threshold as warn slow-request", async () => {
    process.env.AEGIS_SLOW_REQUEST_MS = "1";
    expect(slowRequestThresholdMs()).toBe(1);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = withRequestLog(async (_req, res) => {
      await new Promise((r) => setTimeout(r, 5));
      res.status(200).json({ ok: true });
    }, "/api/slow");
    await handler({ method: "GET", url: "/api/slow", headers: {} }, fakeRes());
    const line = JSON.parse(warn.mock.calls[0]![0] as string);
    expect(line.kind).toBe("slow-request");
  });

  it("catches an unhandled throw: logs the exception and returns a clean 500", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = withRequestLog(async () => {
      throw new Error("kaboom");
    }, "/api/crash");
    const res = fakeRes();
    await handler({ method: "POST", url: "/api/crash", headers: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ ok: false, error: "Internal error" });
    const line = JSON.parse(err.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ kind: "exception", message: "kaboom", route: "/api/crash" });
  });

  it("does not double-respond when the handler already sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const handler = withRequestLog(async (_req, res) => {
      res.status(201).json({ ok: true });
      throw new Error("after-send");
    }, "/api/after");
    const res = fakeRes();
    await handler({ method: "POST", url: "/api/after", headers: {} }, res);
    expect(res.statusCode).toBe(201); // untouched
  });
});

describe("sanitizeClientError", () => {
  it("accepts a minimal valid report and clamps lengths", () => {
    const r = sanitizeClientError({
      message: "x".repeat(1000),
      stack: "s".repeat(5000),
      source: "window.onerror",
      url: "/intake",
    });
    expect(r).not.toBeNull();
    expect(r!.message.length).toBe(500);
    expect(r!.stack!.length).toBe(2000);
  });

  it("rejects garbage", () => {
    expect(sanitizeClientError(null)).toBeNull();
    expect(sanitizeClientError({})).toBeNull();
    expect(sanitizeClientError({ message: "   " })).toBeNull();
    expect(sanitizeClientError({ message: 42 })).toBeNull();
  });
});
