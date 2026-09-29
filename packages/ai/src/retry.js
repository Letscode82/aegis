/**
 * Bounded retry with exponential backoff + jitter for HTTP egress (REL1).
 *
 * Transient upstream failures (429 rate limits, 5xx, Anthropic's 529 overload,
 * dropped connections) shouldn't surface as hard errors on the first blip. This
 * wraps a fetch call with a small number of retries, honoring `Retry-After`
 * when the server sends it. Pure decision helpers (`isRetryableStatus`,
 * `backoffMs`, `parseRetryAfterMs`) are unit-tested without a real network.
 */

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

/** True for statuses worth retrying (transient). */
export function isRetryableStatus(status) {
  return RETRYABLE.has(Number(status));
}

/** Exponential backoff (base * 2^attempt) with ±25% jitter, capped at 8s. */
export function backoffMs(attempt, base = 300) {
  const raw = Math.min(base * Math.pow(2, attempt), 8000);
  const jitter = raw * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(raw + jitter));
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) to ms, or null. */
export function parseRetryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const when = Date.parse(s);
  if (!Number.isNaN(when)) return Math.max(0, when - now);
  return null;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with bounded retries. Retries on a retryable status or a thrown network
 * error, up to `retries` times. Honors Retry-After on the response. Returns the
 * final Response (even if non-ok) or throws the last network error.
 *
 * opts: { retries=2, baseDelayMs=300, fetchImpl=globalThis.fetch, sleep }
 */
export async function fetchWithRetry(url, options = {}, opts = {}) {
  const retries = Number.isFinite(opts.retries) ? opts.retries : 2;
  const base = opts.baseDelayMs ?? 300;
  const fetchImpl = opts.fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  const sleep = opts.sleep || defaultSleep;
  if (!fetchImpl) throw new Error("fetchWithRetry: no fetch implementation available");

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchImpl(url, options);
      if (attempt < retries && isRetryableStatus(resp.status)) {
        const ra = parseRetryAfterMs(resp.headers && typeof resp.headers.get === "function" ? resp.headers.get("retry-after") : null);
        await sleep(ra != null ? ra : backoffMs(attempt, base));
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(backoffMs(attempt, base));
        continue;
      }
      throw err;
    }
  }
  // Unreachable in practice, but satisfy the type of a guaranteed return/throw.
  if (lastErr) throw lastErr;
  throw new Error("fetchWithRetry: exhausted retries");
}
