/**
 * POST /api/office/outlook/triage — file the email the user is reading in
 * Outlook into AEGIS intake.
 *
 * The Outlook add-in reads the open message (subject / sender / body / thread)
 * and posts it here; it runs through the SAME `ingestInboundEmail` pipeline as
 * the email webhook and the mailbox poller, so a manually-filed email becomes an
 * identical IntakeTicket (classified, routed, chain-sealed). Gated on
 * intake:create_ticket — the signed-in user is filing the request.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { ingestInboundEmail, EmailIngestValidationError } from "@aegis/intake/email";
import { serverTriageRunner } from "@aegis/intake/agent-run";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const result = await ingestInboundEmail(
      {
        from: str(b.from),
        fromEmail: str(b.fromEmail),
        subject: str(b.subject) ?? "(no subject)",
        body: str(b.body) ?? "",
        threadId: str(b.threadId),
        messageId: str(b.messageId),
        attachments: b.hasAttachments === true ? [{ filename: "(email attachment)" }] : undefined,
      },
      { organizationId: user.organizationId, triage: serverTriageRunner },
    );
    return res.status(result.deduped ? 200 : 201).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof EmailIngestValidationError) return res.status(400).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
