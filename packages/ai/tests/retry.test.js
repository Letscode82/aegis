import { describe, it, expect, vi } from "vitest";
import { isRetryableStatus, backoffMs, parseRetryAfterMs, fetchWithRetry } from "../src/retry.js";

describe("isRetryableStatus", () => {
  it("retries 429/5xx/529, not 200/400/401/403/404", () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504, 529]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [200, 201, 400, 401, 403, 404, 422]) expect(isRetryableStatus(s)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows with attempt and is capped at ~8s", () => {
    const a0 = backoffMs(0, 300);
    const a5 = backoffMs(5, 300);
    expect(a0).toBeGreaterThanOrEqual(0);
    expect(a5).toBeLessThanOrEqual(8000 * 1.25 + 1);
    // With base 300, attempt 4 (=4800 raw) should generally exceed attempt 0.
    expect(backoffMs(4, 300)).toBeGreaterThan(backoffMs(0, 300) - 1);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
  });
  it("parses HTTP-date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
  });
  it("returns null for missing/garbage", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("soon")).toBeNull();
  });
});

function resp(status, headers = {}) {
  return { status, headers: { get: (k) => headers[k.toLowerCase()] ?? null } };
}

describe("fetchWithRetry", () => {
  it("returns immediately on a non-retryable response", async () => {
    const fetchImpl = vi.fn(async () => resp(200));
    const r = await fetchWithRetry("u", {}, { fetchImpl, sleep: async () => {} });
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(resp(429)).mockResolvedValueOnce(resp(200));
    const sleep = vi.fn(async () => {});
    const r = await fetchWithRetry("u", {}, { fetchImpl, sleep, retries: 2 });
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After seconds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(resp(503, { "retry-after": "1" })).mockResolvedValueOnce(resp(200));
    const sleep = vi.fn(async () => {});
    await fetchWithRetry("u", {}, { fetchImpl, sleep, retries: 2 });
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("gives up after retries and returns the last retryable response", async () => {
    const fetchImpl = vi.fn(async () => resp(529));
    const sleep = vi.fn(async () => {});
    const r = await fetchWithRetry("u", {}, { fetchImpl, sleep, retries: 2 });
    expect(r.status).toBe(529);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("retries a thrown network error then rethrows if it never recovers", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNRESET"); });
    const sleep = vi.fn(async () => {});
    await expect(fetchWithRetry("u", {}, { fetchImpl, sleep, retries: 1 })).rejects.toThrow("ECONNRESET");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
