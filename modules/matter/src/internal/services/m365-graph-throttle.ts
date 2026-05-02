/**
 * Throttle-aware retry handling.
 *
 * The Graph SDK ships its own retry handler (RetryHandler middleware)
 * that already respects `Retry-After`. This module configures the
 * SDK options + provides a thin helper for cases where the SDK error
 * surfaces despite the middleware.
 *
 * The default policy:
 *   - 429 → respect Retry-After (seconds or HTTP date), retry up to 3x
 *   - 5xx → exponential backoff with jitter, retry up to 3x
 *   - otherwise → no retry
 *
 * Once the budget is exhausted, the SDK throws a GraphError with
 * statusCode=429 / 5xx — `mapGraphError` translates that into
 * `M365ThrottleExceededError` for the caller.
 */

export interface ThrottlePolicy {
  /** Maximum retries on 429. SDK default is 3; we keep it. */
  maxRetries: number;
  /** Cap (seconds) on Retry-After we respect — beyond this, we give up. */
  maxRetryAfterSeconds: number;
  /** Base delay (ms) for exponential backoff on 5xx. */
  backoffBaseMs: number;
  /** Cap on backoff delay (ms). */
  backoffMaxMs: number;
}

export const DEFAULT_THROTTLE_POLICY: ThrottlePolicy = {
  maxRetries: 3,
  maxRetryAfterSeconds: 300,
  backoffBaseMs: 500,
  backoffMaxMs: 30_000,
};

/**
 * SDK middleware-options factory. Applied via
 * `Client.initWithMiddleware({ middleware: ... })` in m365-graph-client.
 */
export function buildRetryHandlerOptions(policy: ThrottlePolicy = DEFAULT_THROTTLE_POLICY): {
  delay: number;
  maxRetries: number;
  shouldRetry: (delay: number, attempt: number, request: Request, response: Response) => boolean;
} {
  return {
    delay: policy.backoffBaseMs / 1000, // seconds — SDK convention
    maxRetries: policy.maxRetries,
    shouldRetry: (
      _delay: number,
      attempt: number,
      _request: Request,
      response: Response,
    ): boolean => {
      if (attempt >= policy.maxRetries) return false;
      // 429 always retried (SDK extracts Retry-After itself).
      if (response.status === 429) return true;
      // 5xx retried.
      if (response.status >= 500 && response.status < 600) return true;
      return false;
    },
  };
}

/**
 * Compute the next backoff delay given the attempt index. Used by
 * tests to confirm the policy is sane; the SDK's middleware handles
 * the actual sleep.
 */
export function nextBackoffMs(
  attempt: number,
  policy: ThrottlePolicy = DEFAULT_THROTTLE_POLICY,
): number {
  const exp = Math.min(
    policy.backoffMaxMs,
    policy.backoffBaseMs * Math.pow(2, attempt),
  );
  // Jitter +/- 20%.
  const jitter = exp * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}
