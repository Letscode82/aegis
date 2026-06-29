/**
 * POST /api/intake/email-webhook
 *
 * Inbound email → IntakeTicket (Intake P4a, stub-first). Accepts a plain
 * JSON body so the channel is demoable with curl, with no Microsoft Graph
 * dependency:
 *
 *   curl -X POST http://localhost:5173/api/intake/email-webhook \
 *     -H 'content-type: application/json' \
 *     -d '{"from":"Dana Lee","fromEmail":"dana@acme.com",
 *          "subject":"NDA for Acme Robotics",
 *          "body":"We need a mutual NDA with Acme Robotics before the pilot."}'
 *
 * The ticket is classified + routed + audited synchronously; it appears
 * in the Triage Cockpit as AWAITING_TRIAGE and the client-side agents
 * draft a recommendation on first view (see modules/intake/src/email/
 * server.ts for the P4a boundary).
 *
 * Auth: this endpoint is intentionally NOT behind the Auth0 session gate
 * — a mail gateway has no session. It authenticates with the shared
 * secret AEGIS_EMAIL_WEBHOOK_SECRET in `x-aegis-webhook-secret` (or
 * `?secret=`), compared in constant time. It is **fail-closed in
 * production**: with no secret configured it returns 503 (never an open
 * ingest endpoint). In dev (no secret) it stays open for curl demos.
 * Idempotent on `messageId` — a redelivery resolves to the existing
 * ticket. The ticket is created by the SYSTEM actor on the chain-sealed
 * audit ledger.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  ingestInboundEmail,
  EmailIngestValidationError,
  checkWebhookAuth,
} from "@aegis/intake/email";
import { serverTriageRunner } from "@aegis/intake/agent-run";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const header = req.headers["x-aegis-webhook-secret"];
  const provided = Array.isArray(header) ? header[0] : header;
  const auth = checkWebhookAuth({
    configuredSecret: process.env.AEGIS_EMAIL_WEBHOOK_SECRET,
    provided: provided ?? (typeof req.query.secret === "string" ? req.query.secret : null),
    isProduction: process.env.NODE_ENV === "production",
  });
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.reason });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await ingestInboundEmail({
      from: typeof body.from === "string" ? body.from : undefined,
      fromEmail: typeof body.fromEmail === "string" ? body.fromEmail : undefined,
      subject: typeof body.subject === "string" ? body.subject : "",
      body: typeof body.body === "string" ? body.body : "",
      threadId: typeof body.threadId === "string" ? body.threadId : undefined,
      messageId: typeof body.messageId === "string" ? body.messageId : undefined,
      department: typeof body.department === "string" ? body.department : undefined,
      attachments: Array.isArray(body.attachments)
        ? (body.attachments as Array<Record<string, unknown>>)
            .map((a) => ({
              filename: typeof a?.filename === "string" ? a.filename : "",
              mimeType: typeof a?.mimeType === "string" ? a.mimeType : undefined,
              sizeBytes: typeof a?.sizeBytes === "number" ? a.sizeBytes : undefined,
            }))
            .filter((a) => a.filename)
        : undefined,
    }, { triage: serverTriageRunner });
    return res.status(201).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof EmailIngestValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/email-webhook] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
