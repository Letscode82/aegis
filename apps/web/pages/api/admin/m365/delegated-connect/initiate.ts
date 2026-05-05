/**
 * POST /api/admin/m365/delegated-connect/initiate
 *
 * Begins a Device Code OAuth session for the org's eDiscovery
 * service account (sub-PR 4c.1). Returns the user code +
 * verification URL the operator must enter at
 * https://microsoft.com/devicelogin.
 *
 * The actual token exchange completes asynchronously — the client
 * polls /poll?sessionId until status is "connected" or "error".
 *
 * Response shape (sub-PR 4c.1 cleanup):
 *   200 { ok: true, sessionId, userCode, verificationUri, expiresAt, message }
 *   4xx { ok: false, error: { code, message } }
 *
 * Permission: admin:m365:manage (admin auto-includes via superuser
 * bundle).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { initiateDeviceCodeFlow } from "@aegis/matter";
import { logAudit, prisma } from "@aegis/db";
import { requireActor } from "../../../../../lib/matter-actor";

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

  // Resolve the tenant + clientId — Device Code flow uses the same
  // app registration as app-only auth, just a different OAuth grant.
  const credRow = await prisma.organizationM365Credential.findUnique({
    where: { organizationId: actor.organizationId },
  });
  const tenantId = credRow?.tenantId ?? process.env.M365_TENANT_ID;
  const clientId = credRow?.clientId ?? process.env.M365_CLIENT_ID;
  if (!tenantId || !clientId) {
    return res.status(412).json({
      ok: false,
      error: {
        code: "M365_NOT_CONFIGURED",
        message:
          "M365 connection not configured. Set up app-only credentials at /admin/m365 first.",
      },
    });
  }

  try {
    const result = await initiateDeviceCodeFlow({
      organizationId: actor.organizationId,
      tenantId,
      clientId,
      authorizedById: actor.id,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const code = e.name ?? "DEVICE_CODE_INITIATE_FAILED";
    const message = (e.message ?? String(err)).slice(0, 240);
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "m365.delegated.connect.failed",
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
