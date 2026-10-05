/**
 * GET  /api/matter/client-portal — list client-portal recipients + their
 *      current link status (gated `matter:read_all`).
 * POST /api/matter/client-portal — mint a portal link for a Person.
 *      Body: { personId, label?, expiresInDays? } (gated `matter:update`).
 *
 * C-10 internal admin surface. The minted raw token is returned ONCE in the
 * POST response (never stored in plaintext); the admin copies the link to
 * share it. The public view lives at /api/portal/client/[token].
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listClientPortalRecipientsService,
  mintClientPortalTokenService,
  ClientPortalPersonNotFoundError,
} from "@aegis/matter";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.MatterReadAll);
    if (!actor) return;
    const recipients = await listClientPortalRecipientsService(actor.organizationId);
    return res.status(200).json({ ok: true, recipients });
  }
  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterUpdate);
    if (!actor) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const personId = typeof body.personId === "string" ? body.personId : "";
    if (!personId) return res.status(400).json({ ok: false, error: "personId is required" });
    try {
      const minted = await mintClientPortalTokenService(
        actor.organizationId,
        personId,
        {
          label: typeof body.label === "string" ? body.label : undefined,
          expiresInDays: typeof body.expiresInDays === "number" ? body.expiresInDays : undefined,
        },
        actor,
      );
      return res.status(200).json({ ok: true, minted });
    } catch (err) {
      if (err instanceof ClientPortalPersonNotFoundError) return res.status(404).json({ ok: false, error: err.message });
      console.error("[/api/matter/client-portal] mint failed:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
