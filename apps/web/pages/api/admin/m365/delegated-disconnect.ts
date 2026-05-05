/**
 * POST /api/admin/m365/delegated-disconnect
 *
 * Wipes the stored delegated-auth refresh token + access-token cache
 * for the actor's org. After disconnect, eDiscovery operations
 * fail-loud with M365DelegatedAuthRequiredError in production until
 * a re-authorize completes.
 *
 * Response shape (sub-PR 4c.1 cleanup):
 *   200 { ok: true }
 *   4xx { ok: false, error: { code, message } }
 *
 * Permission: admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { clearDelegatedTokens } from "@aegis/matter";
import { logAudit } from "@aegis/db";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const actor = await requireActor(req, res, Permission.AdminM365Manage);
  if (!actor) return;
  try {
    await clearDelegatedTokens(actor.organizationId, {
      lastRefreshError: "disconnected by admin",
    });
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "m365.delegated.disconnected",
      resourceType: "OrganizationM365Credential",
      resourceId: actor.organizationId,
      metadata: { source: "admin-ui" },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const code = e.name ?? "DELEGATED_DISCONNECT_FAILED";
    const message = (e.message ?? String(err)).slice(0, 240);
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "m365.delegated.disconnect.failed",
      resourceType: "OrganizationM365Credential",
      resourceId: actor.organizationId,
      metadata: { errorCode: code, errorMessage: message },
    });
    return res.status(500).json({
      ok: false,
      error: { code, message },
    });
  }
}
