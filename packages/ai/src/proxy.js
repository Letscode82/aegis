/**
 * Server-side proxy logic for the Anthropic Messages API.
 *
 * Pulled out of the bare-Node serverless function so it can be hosted from
 * any Node runtime — Next.js Pages API routes, classic Vercel functions,
 * Cloudflare Workers (with shims), etc.
 *
 * The HTTP boundary (`req`/`res`) is passed in. We only handle:
 *   - method check (POST only)
 *   - per-IP rate limit (in-memory; resets on cold start)
 *   - body size cap (50 KB)
 *   - upstream call to Anthropic with the server-held API key
 *   - response passthrough
 */

import { redactMessagesBody, isPIIRedactionEnabled } from "./pii.js";
import { fetchWithRetry, shouldFallback } from "./retry.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const BODY_LIMIT_BYTES = 50 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 20;

const ipHits = new Map();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim();
  return "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (ipHits.get(ip) || []).filter((t) => t > cutoff);
  if (hits.length >= RATE_LIMIT) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

export async function handleClaudeRequest(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return res
      .status(429)
      .json({ error: "Rate limit exceeded — 20 requests per minute per IP" });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > BODY_LIMIT_BYTES) {
    return res.status(413).json({ error: "Request body exceeds 50KB limit" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[packages/ai] ANTHROPIC_API_KEY is not set");
    return res.status(500).json({ error: "AI service not configured" });
  }

  let body =
    req.body && typeof req.body === "object"
      ? JSON.stringify(req.body)
      : typeof req.body === "string"
      ? req.body
      : "";
  if (!body) {
    return res.status(400).json({ error: "Missing request body" });
  }

  // The server is the authority on the model. Two reasons to rewrite it:
  //   1. ANTHROPIC_MODEL is set — an explicit per-deployment override.
  //   2. the client sent no model, or a known-DEAD model id — which
  //      happens when a browser is running a stale cached bundle. The
  //      retired "claude-sonnet-4-6" id 404s upstream and degrades every
  //      agent; we must never forward it, even from an old client.
  // Otherwise the caller's (valid) model is forwarded unchanged.
  const SAFE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const DEAD_MODELS = new Set(["claude-sonnet-4-6"]);
  let piiRedactions = 0;
  let sentModel = "";
  try {
    const parsed = JSON.parse(body);
    let changed = false;
    if (process.env.ANTHROPIC_MODEL || !parsed.model || DEAD_MODELS.has(parsed.model)) {
      parsed.model = SAFE_MODEL;
      changed = true;
    }
    sentModel = typeof parsed.model === "string" ? parsed.model : "";
    // SEC1 — opt-in PII redaction: scrub common PII from the outbound prompt so
    // privileged identifiers don't leave the tenant. Off by default; enable
    // with AEGIS_PII_REDACTION=on. Degrades safely (no-op on parse failure).
    if (isPIIRedactionEnabled()) {
      const { total } = redactMessagesBody(parsed);
      piiRedactions = total;
      if (total > 0) changed = true;
    }
    if (changed) body = JSON.stringify(parsed);
  } catch {
    /* non-JSON body — forward unchanged */
  }
  if (Buffer.byteLength(body, "utf8") > BODY_LIMIT_BYTES) {
    return res.status(413).json({ error: "Request body exceeds 50KB limit" });
  }

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  try {
    // REL1 — retry transient upstream failures (429 / 5xx / 529 overload /
    // dropped connection) with bounded exponential backoff, honoring Retry-After.
    let upstream = await fetchWithRetry(ANTHROPIC_URL, { method: "POST", headers, body }, { retries: 2, baseDelayMs: 400 });

    // GW1 — model gateway fallback: if the primary model is still failing with
    // an overload / server error / dead-model status after retries, try a
    // configured fallback model ONCE. Off unless ANTHROPIC_FALLBACK_MODEL is set.
    const FALLBACK_MODEL = process.env.ANTHROPIC_FALLBACK_MODEL || "";
    let modelFallback = "";
    if (!upstream.ok && FALLBACK_MODEL && sentModel && sentModel !== FALLBACK_MODEL && shouldFallback(upstream.status)) {
      try {
        const p = JSON.parse(body);
        p.model = FALLBACK_MODEL;
        const fbBody = JSON.stringify(p);
        if (Buffer.byteLength(fbBody, "utf8") <= BODY_LIMIT_BYTES) {
          const retryResp = await fetchWithRetry(ANTHROPIC_URL, { method: "POST", headers, body: fbBody }, { retries: 1, baseDelayMs: 400 });
          upstream = retryResp; // use the fallback attempt's response (ok or not)
          if (retryResp.ok) modelFallback = FALLBACK_MODEL;
        }
      } catch {
        /* body not re-parseable — keep the primary response */
      }
    }

    const text = await upstream.text();
    res.status(upstream.status);
    if (modelFallback) res.setHeader("x-aegis-model-fallback", modelFallback);
    res.setHeader("content-type", "application/json");
    if (piiRedactions > 0) res.setHeader("x-aegis-pii-redacted", String(piiRedactions));
    return res.send(text);
  } catch (err) {
    console.error("[packages/ai] upstream fetch failed:", err);
    return res.status(500).json({ error: "Upstream AI service unavailable" });
  }
}
