/**
 * GET  /api/admin/intake/mailboxes  — list configured intake mailboxes
 * POST /api/admin/intake/mailboxes  — add one { address, displayName? }
 *
 * Gated on admin:m365:manage (the same grant that governs the delegated
 * service account the poller uses).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listMailboxes,
  createMailbox,
  MailboxValidationError,
} from "@aegis/intake/mailbox";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;

  if (req.method === "GET") {
    const mailboxes = await listMailboxes(actor.organizationId);
    return res.status(200).json({ ok: true, mailboxes });
  }
  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const mailbox = await createMailbox(
        actor.organizationId,
        {
          address: typeof body.address === "string" ? body.address : "",
          displayName: typeof body.displayName === "string" ? body.displayName : null,
        },
        { req, res },
      );
      return res.status(201).json({ ok: true, mailbox });
    } catch (err) {
      if (err instanceof MailboxValidationError) {
        return res.status(400).json({ ok: false, error: err.message });
      }
      // Unique-constraint (duplicate address) → 409.
      if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
        return res.status(409).json({ ok: false, error: "That mailbox is already configured." });
      }
      console.error("[/api/admin/intake/mailboxes] POST failed:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
