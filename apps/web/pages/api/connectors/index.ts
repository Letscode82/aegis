/**
 * GET /api/connectors — list the wired connectors and this org's connection
 * status for each. Gated on admin:m365:manage (the Microsoft-integration grant;
 * C-1/C-2 are Microsoft 365 surfaces). No Graph call — reads the local
 * OrgConnectorCredential rows only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma } from "@aegis/db";
import { connectorMeta, isConnectorConfigured } from "../../../lib/connectors/runtime";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.AdminM365Manage);
    const rows = await prisma.orgConnectorCredential.findMany({
      where: { organizationId: user.organizationId },
      select: {
        connectorId: true,
        status: true,
        accountLabel: true,
        scopesGranted: true,
        tokenExpiresAt: true,
        authorizedAt: true,
        lastRefreshedAt: true,
        lastError: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.connectorId, r]));
    const connectors = connectorMeta().map((m) => {
      const row = byId.get(m.id);
      return {
        ...m,
        status: row?.status ?? "not_connected",
        accountLabel: row?.accountLabel ?? null,
        scopesGranted: row?.scopesGranted ?? null,
        tokenExpiresAt: row?.tokenExpiresAt ?? null,
        authorizedAt: row?.authorizedAt ?? null,
        lastRefreshedAt: row?.lastRefreshedAt ?? null,
        lastError: row?.lastError ?? null,
      };
    });
    return res.status(200).json({ ok: true, configured: isConnectorConfigured(), connectors });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
