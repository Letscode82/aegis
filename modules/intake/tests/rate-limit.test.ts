/**
 * Webhook rate limiter (hardening). Sliding window, injectable clock.
 */
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/email/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to max within the window, then blocks", () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(rl.check("ip", 0).ok).toBe(true);
    expect(rl.check("ip", 100).ok).toBe(true);
    const third = rl.check("ip", 200);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("recovers after the window slides past old hits", () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(rl.check("ip", 0).ok).toBe(true);
    expect(rl.check("ip", 500).ok).toBe(false); // still within window
    expect(rl.check("ip", 1500).ok).toBe(true); // first hit aged out
  });

  it("tracks keys (IPs) independently", () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(rl.check("a", 0).ok).toBe(true);
    expect(rl.check("b", 0).ok).toBe(true); // different key, own budget
    expect(rl.check("a", 0).ok).toBe(false);
  });
});
