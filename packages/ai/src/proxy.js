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
  try {
    const parsed = JSON.parse(body);
    if (process.env.ANTHROPIC_MODEL || !parsed.model || DEAD_MODELS.has(parsed.model)) {
      parsed.model = SAFE_MODEL;
      body = JSON.stringify(parsed);
    }
  } catch {
    /* non-JSON body — forward unchanged */
  }
  if (Buffer.byteLength(body, "utf8") > BODY_LIMIT_BYTES) {
    return res.status(413).json({ error: "Request body exceeds 50KB limit" });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", "application/json");
    return res.send(text);
  } catch (err) {
    console.error("[packages/ai] upstream fetch failed:", err);
    return res.status(500).json({ error: "Upstream AI service unavailable" });
  }
}
