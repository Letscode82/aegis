/**
 * POST /api/intake/teams-webhook
 *
 * Microsoft Teams intake channel (W3-1). Point a Teams **outgoing
 * webhook** at this URL; mentioning it in a channel files a legal
 * request on the same P4a pipeline as email (classify → route →
 * persist → audit, source TEAMS) and replies in-channel with the
 * ticket id. `@AEGIS status <id>` / `@AEGIS status` / `@AEGIS help`
 * answer without filing.
 *
 * Auth: Teams outgoing webhooks sign the RAW body with HMAC-SHA256
 * using the security token issued at webhook creation
 * (`Authorization: HMAC <base64>`). Set that token as
 * AEGIS_TEAMS_WEBHOOK_SECRET. **Fail-closed in production** — with no
 * secret configured the route returns 503; in dev it stays open so
 * the channel is demoable with curl:
 *
 *   curl -X POST http://localhost:5173/api/intake/teams-webhook \
 *     -H 'content-type: application/json' \
 *     -d '{"type":"message","id":"m1","from":{"name":"Dana Lee"},
 *          "text":"<at>AEGIS</at> We need a mutual NDA with Acme."}'
 *
 * Body parsing is disabled so the HMAC verifies the exact bytes Teams
 * signed. Idempotent on the Teams message id (retries dedupe).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyTeamsHmac, handleTeamsActivity } from "@aegis/intake/teams-channel";
import type { TeamsActivity } from "@aegis/intake/teams-channel";
import { createRateLimiter } from "@aegis/intake/email";
import { serverTriageRunner } from "@aegis/intake/agent-run";

export const config = { api: { bodyParser: false } };

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

function clientIp(req: NextApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return (fwd.split(",")[0] ?? fwd).trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.length) return real.trim();
  return "unknown";
}

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const rl = limiter.check(clientIp(req));
  if (!rl.ok) {
    if (rl.retryAfterSec) res.setHeader("Retry-After", String(rl.retryAfterSec));
    return res.status(429).json({ ok: false, error: "Rate limit exceeded" });
  }

  const rawBody = await readRawBody(req);

  // Auth — same fail-closed posture as the email webhook.
  const secret = process.env.AEGIS_TEAMS_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === "production";
  if (secret) {
    const header = req.headers.authorization;
    const ok = verifyTeamsHmac({
      rawBody,
      authHeader: Array.isArray(header) ? header[0] : header,
      secretBase64: secret,
    });
    if (!ok) {
      return res.status(401).json({ ok: false, error: "Invalid HMAC signature" });
    }
  } else if (isProduction) {
    return res.status(503).json({
      ok: false,
      error:
        "Teams channel not configured — set AEGIS_TEAMS_WEBHOOK_SECRET to the outgoing webhook's security token.",
    });
  }

  let activity: TeamsActivity;
  try {
    activity = JSON.parse(rawBody.toString("utf8")) as TeamsActivity;
  } catch {
    return res.status(400).json({ ok: false, error: "Body must be JSON" });
  }

  try {
    const reply = await handleTeamsActivity(activity, {
      triage: serverTriageRunner,
    });
    // Teams renders whatever Activity we return as the webhook's reply.
    return res.status(200).json(reply);
  } catch (err) {
    console.error("[/api/intake/teams-webhook] failed:", err);
    return res.status(200).json({
      type: "message",
      text: "Something went wrong on the AEGIS side — please try again shortly.",
    });
  }
}
