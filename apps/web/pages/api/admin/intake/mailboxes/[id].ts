/**
 * PUT    /api/admin/intake/mailboxes/[id]  — { enabled } toggle
 * DELETE /api/admin/intake/mailboxes/[id]  — remove
 *
 * Gated on admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  updateMailbox,
  deleteMailbox,
  MailboxNotFoundError,
} from "@aegis/intake/mailbox";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";

  try {
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const mailbox = await updateMailbox(
        actor.organizationId,
        id,
        {
          enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
          autoAckEnabled:
            typeof body.autoAckEnabled === "boolean" ? body.autoAckEnabled : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, mailbox });
    }
    if (req.method === "DELETE") {
      await deleteMailbox(actor.organizationId, id, { req, res });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof MailboxNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    console.error("[/api/admin/intake/mailboxes/[id]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
