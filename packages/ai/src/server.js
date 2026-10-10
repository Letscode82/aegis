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
export async function callAnthropicMessages(body, opts = {}) {
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
        // Caller-supplied deadline (callClaude's AbortController). fetchWithRetry
        // does NOT retry an abort — a timeout fails fast and cleanly.
        signal: opts.signal,
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

/**
 * Stream a Claude completion token-by-token (server-side only).
 *
 * Sets `stream: true` on the Messages API call and parses the Anthropic SSE,
 * invoking `opts.onText(delta)` for each text delta as it arrives and
 * returning the full concatenated text when the stream ends. This is what
 * lets a long review (deep skill review, document read) render progressively
 * in the UI instead of being buffered into one response that can outrun the
 * serverless function's time limit — the same pattern Harvey / Legora /
 * ChatGPT use.
 *
 * Throws on a non-2xx open, a missing key, or an upstream `error` event, with
 * `.status` / `.body` set so callers' friendlyAIError + degraded fallback
 * behave the same as the buffered path. Honors `opts.signal` (AbortController)
 * for a caller deadline / a user "Stop". Single attempt — no retry — because
 * the buffered route stays as the degrade path.
 *
 * @param {object} body Messages API body ({ model, max_tokens, system, messages }).
 * @param {{ signal?: AbortSignal, onText?: (text: string) => void }} [opts]
 * @returns {Promise<string>} the full text.
 */
export async function streamAnthropicMessages(body, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[@aegis/ai/server] ANTHROPIC_API_KEY is not set");
    const e = new Error("AI service not configured");
    e.status = 500;
    e.body = "ANTHROPIC_API_KEY not configured";
    throw e;
  }
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal: opts.signal,
  });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    console.error(`[@aegis/ai/server] Claude stream ${resp.status}: ${text.slice(0, 300)}`);
    const e = new Error(`Claude API ${resp.status}: ${text.slice(0, 200)}`);
    e.status = resp.status;
    e.body = text;
    throw e;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  // Parse the SSE frames: events are separated by a blank line; within an
  // event the `data:` line(s) carry the JSON. We only care about
  // `content_block_delta` text deltas; an `error` event aborts.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataStr = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("\n");
      if (!dataStr || dataStr === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(dataStr);
      } catch {
        continue; // partial / non-JSON keep-alive frame
      }
      if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
        const t = evt.delta.text || "";
        if (t) {
          full += t;
          if (opts.onText) opts.onText(t);
        }
      } else if (evt.type === "error") {
        const msg = (evt.error && (evt.error.message || evt.error.type)) || "stream error";
        console.error(`[@aegis/ai/server] Claude stream error: ${msg}`);
        const e = new Error(msg);
        e.status = (evt.error && evt.error.status) || 502;
        throw e;
      }
    }
  }
  return full;
}

let _installed = false;
/** Idempotently route @aegis/ai's callClaude through the direct
 * Anthropic transport for this process. */
export function ensureServerClaudeTransport() {
  if (_installed) return;
  setClaudeTransport(callAnthropicMessages);
  _installed = true;
}
