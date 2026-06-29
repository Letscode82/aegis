/**
 * POST /api/admin/intake/mailboxes/poll
 *
 * Poll intake mailboxes now and ingest new messages as tickets. Body:
 *   { mailboxId }  → poll just that mailbox
 *   {}             → poll every enabled mailbox
 *
 * pg-boss-ready admin trigger (same pattern as the defensibility /
 * sanctions jobs): a scheduler (Vercel Cron / GitHub Actions) can hit
 * this on a cadence until a worker runtime hosts the schedule directly.
 * Gated on admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  pollMailboxForIntake,
  pollAllEnabledMailboxes,
  MailboxNotFoundError,
} from "@aegis/intake/mailbox";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const mailboxId = typeof body.mailboxId === "string" ? body.mailboxId : null;

  try {
    const results = mailboxId
      ? [await pollMailboxForIntake(actor.organizationId, mailboxId)]
      : await pollAllEnabledMailboxes(actor.organizationId);
    const created = results.reduce((a, r) => a + r.created, 0);
    return res.status(200).json({ ok: true, created, results });
  } catch (err) {
    if (err instanceof MailboxNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    console.error("[/api/admin/intake/mailboxes/poll] failed:", err);
    return res.status(500).json({ ok: false, error: String(err instanceof Error ? err.message : err) });
  }
}
