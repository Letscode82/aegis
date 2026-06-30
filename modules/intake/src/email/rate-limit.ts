/**
 * In-memory sliding-window rate limiter for the public email webhook
 * (hardening). The webhook has no session, so it's a small fixed-cost
 * guard against a misconfigured sender or abuse looping the ingest.
 *
 * In-memory (per serverless instance, resets on cold start) — same
 * pragmatic model as the @aegis/ai proxy limiter. Pure + injectable
 * clock so it's unit-testable.
 */
export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry (only when !ok). */
  retryAfterSec?: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

export function createRateLimiter(opts: { windowMs: number; max: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const cutoff = now - opts.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        const oldest = recent[0] ?? now;
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
