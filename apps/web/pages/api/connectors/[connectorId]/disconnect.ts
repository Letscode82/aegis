/**
 * POST /api/connectors/[connectorId]/disconnect — clear a connector's stored
 * tokens and mark the connection not_connected (the row is kept for audit).
 * Gated on admin:m365:manage; writes a chain-sealed `connector.disconnected`
 * audit row.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { logAudit } from "@aegis/db";
import { getTokenStore } from "../../../../lib/connectors/runtime";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const connectorId = String(req.query.connectorId || "");
  try {
    assertUserCanDo(user, Permission.AdminM365Manage);
    await getTokenStore().delete(user.organizationId, connectorId);
    await logAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      actorType: "USER",
      action: "connector.disconnected",
      resourceType: "OrgConnectorCredential",
      resourceId: connectorId,
      metadata: { connectorId },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
