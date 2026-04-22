// Vercel Node.js serverless function. Proxies browser requests to the
// Anthropic Messages API so the API key stays server-side and CORS is
// side-stepped. Deployed automatically as /api/claude by Vercel.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const BODY_LIMIT_BYTES = 50 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 20;

// In-memory rate-limit store. Serverless cold starts reset it — acceptable
// for a demo at this scale.
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
  const hits = (ipHits.get(ip) || []).filter(t => t > cutoff);
  if (hits.length >= RATE_LIMIT) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Rate limit exceeded — 20 requests per minute per IP" });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > BODY_LIMIT_BYTES) {
    return res.status(413).json({ error: "Request body exceeds 50KB limit" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[api/claude] ANTHROPIC_API_KEY is not set in the server environment");
    return res.status(500).json({ error: "AI service not configured" });
  }

  const body = req.body && typeof req.body === "object"
    ? JSON.stringify(req.body)
    : typeof req.body === "string" ? req.body : "";
  if (!body) {
    return res.status(400).json({ error: "Missing request body" });
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
    console.error("[api/claude] upstream fetch failed:", err);
    return res.status(500).json({ error: "Upstream AI service unavailable" });
  }
}
