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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Call Anthropic directly. Returns the parsed response JSON. Throws an
 * error carrying `.status` / `.body` on a non-2xx or missing key, so
 * callers' friendlyAIError + degraded-fallback paths behave identically
 * to the proxy path. */
export async function callAnthropicMessages(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
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
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
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
