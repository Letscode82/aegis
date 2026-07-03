/**
 * POST /api/client-errors — browser error ingestion (W4-5).
 *
 * The window error reporter (_app) and PanelBoundary post here so
 * client-side crashes land on the server log stream as structured
 * `client-error` events — searchable in the same drain as request and
 * slow-query lines. Rate-limited per IP; payloads are validated and
 * clamped server-side (untrusted input, never re-rendered anywhere).
 * Always 204 on accept — the reporter is fire-and-forget.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { logEvent, sanitizeClientError } from "@aegis/observability";
import { createRateLimiter } from "@aegis/intake/email";

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

function clientIp(req: NextApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return (fwd.split(",")[0] ?? fwd).trim();
  return "unknown";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!limiter.check(clientIp(req)).ok) {
    return res.status(429).end();
  }
  const report = sanitizeClientError(req.body);
  if (!report) return res.status(400).end();

  logEvent("error", "client-error", {
    message: report.message,
    stack: report.stack,
    source: report.source,
    url: report.url,
    ua: String(req.headers["user-agent"] ?? "").slice(0, 160),
  });
  return res.status(204).end();
}
