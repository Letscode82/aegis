/**
 * @aegis/ai/server — server-only Claude transport.
 *
 * Lets server runtimes run the same agent code that the browser runs.
 * The browser `callClaude` POSTs to the relative `/api/claude` proxy (so
 * the key stays server-side); on the server that relative URL has no
 * origin. `ensureServerClaudeTransport()` installs a transport that calls
 * the Anthropic Messages API directly with the server-held key, so
 * `callClaude` / `callClaudeJSON` work unchanged inside a Node process
 * (the intake agent worker).
 *
 * NEVER import this from browser code — it reads ANTHROPIC_API_KEY.
 */
import { setClaudeTransport } from "./claude.js";
import { fetchWithRetry } from "./retry.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Call Anthropic directly. Returns the parsed response JSON. Throws an
 * error carrying `.status` / `.body` on a non-2xx or missing key, so
 * callers' friendlyAIError + degraded-fallback paths behave identically
 * to the proxy path.
 *
 * Transient upstream failures (429 rate limit, 5xx, Anthropic's 529
 * overload, dropped connection) are retried with bounded exponential
 * backoff via `fetchWithRetry` (REL1) — the same resilience the browser
 * `/api/claude` proxy already has. Without this, a transient overload on
 * a heavier server-side call (e.g. a 1500-token one-legal triage) surfaces
 * immediately as "AI offline" even though a retry would have succeeded,
 * while a cheap call made moments earlier looks healthy.
 *
 * On a final failure we `console.error` the upstream status + body so the
 * reason (invalid key / rejected model / out of credit / overload) is
 * visible in the server logs — the one-legal routes degrade silently, and
 * this is the only breadcrumb to why. */
export async function callAnthropicMessages(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[@aegis/ai/server] ANTHROPIC_API_KEY is not set");
    const e = new Error("AI service not configured");
    e.status = 500;
    e.body = "ANTHROPIC_API_KEY not configured";
    throw e;
  }
  let resp;
  try {
    resp = await fetchWithRetry(
      ANTHROPIC_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      { retries: 2, baseDelayMs: 400 }
    );
  } catch (err) {
    // Network error after exhausting retries (DNS, reset, timeout).
    console.error(`[@aegis/ai/server] Claude request failed (network): ${String(err && err.message || err)}`);
    throw err;
  }
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`[@aegis/ai/server] Claude API ${resp.status}: ${text.slice(0, 300)}`);
    const e = new Error(`Claude API ${resp.status}: ${text.slice(0, 200)}`);
    e.status = resp.status;
    e.body = text;
    throw e;
  }
  return JSON.parse(text);
}

let _installed = false;
/** Idempotently route @aegis/ai's callClaude through the direct
 * Anthropic transport for this process. */
export function ensureServerClaudeTransport() {
  if (_installed) return;
  setClaudeTransport(callAnthropicMessages);
  _installed = true;
}
