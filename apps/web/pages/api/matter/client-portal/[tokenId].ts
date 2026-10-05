/**
 * DELETE /api/matter/client-portal/[tokenId] — revoke a client-portal link.
 *
 * C-10. Gated `matter:update`; writes a chain-sealed `matter.portal.revoked`
 * audit row. Revoking a non-ACTIVE token is a no-op.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { revokeClientPortalTokenService, ClientPortalTokenNotFoundError } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.MatterUpdate);
  if (!actor) return;

  const tokenId = typeof req.query.tokenId === "string" ? req.query.tokenId : "";
  if (!tokenId) return res.status(400).json({ ok: false, error: "Missing token id" });

  try {
    await revokeClientPortalTokenService(actor.organizationId, tokenId, actor);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof ClientPortalTokenNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    console.error("[/api/matter/client-portal/[tokenId]] revoke failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
