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
 * Permission: admin:m365:manage (admin auto-includes via superuser
 * bundle).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { initiateDeviceCodeFlow } from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
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
      error:
        "M365 connection not configured. Set up app-only credentials at /admin/m365 first.",
    });
  }

  try {
    const result = await initiateDeviceCodeFlow({
      organizationId: actor.organizationId,
      tenantId,
      clientId,
      authorizedById: actor.id,
    });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[delegated-connect/initiate] failed:", err);
    return res
      .status(500)
      .json({ error: String((err as Error)?.message ?? err) });
  }
}
