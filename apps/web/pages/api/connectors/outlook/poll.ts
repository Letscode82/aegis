/**
 * POST /api/connectors/outlook/poll — pull the shared Outlook mailbox into
 * intake using the Outlook CONNECTOR token (DbTokenStore), not the matter
 * module's M365 credentials.
 *
 * Body { mailboxId } polls that mailbox; {} polls every enabled mailbox. Each
 * message runs through the same `ingestInboundEmail` pipeline as the P4a webhook
 * via the `MailPoller` seam. pg-boss-ready admin trigger (same shape as the
 * existing /api/admin/intake/mailboxes/poll). Gated on admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { pollMailboxForIntake, pollAllEnabledMailboxes, MailboxNotFoundError } from "@aegis/intake/mailbox";
import { requireActor } from "../../../../lib/matter-actor";
import { connectorOutlookPoller, OutlookConnectorNotConnectedError } from "../../../../lib/connectors/outlook-graph";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const mailboxId = typeof body.mailboxId === "string" ? body.mailboxId : null;
  const opts = { poller: connectorOutlookPoller };

  try {
    const results = mailboxId
      ? [await pollMailboxForIntake(actor.organizationId, mailboxId, opts)]
      : await pollAllEnabledMailboxes(actor.organizationId, opts);
    const created = results.reduce((a, r) => a + r.created, 0);
    return res.status(200).json({ ok: true, created, results });
  } catch (err) {
    if (err instanceof MailboxNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof OutlookConnectorNotConnectedError) return res.status(409).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
