/**
 * /api/admin/one-legal/research-connectors — manage legal-research API keys (C-4).
 *
 * The admin surface for the C-4 providers. Keys are optional (every provider
 * works anonymously / on a public key), so this is how an org raises its rate
 * limits or unlocks a licensed source. Keys persist encrypted at rest in
 * `OrgConnectorCredential` through the F-8 `DbTokenStore` (#507) — the same
 * encrypted seam DMS and e-sign connectors use — and every change is chain-
 * sealed in the audit ledger.
 *
 *   GET    → provider catalog + per-provider connection status (no secret read)
 *   POST   → { connectorId, apiKey } sets a key · { connectorId, clear:true } clears it
 *
 * Gated admin:manage_users (admin superuser holds it); M365-manage admins pass too.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma, encryptSecret, decryptSecret, logAudit } from "@aegis/db";
import { DbTokenStore, defaultResearchProviders, type ConnectorCredentialClient, type TokenSet } from "@aegis/connectors";
import { requireActorAny } from "../../../../lib/matter-actor";

/** API keys don't expire; park expiry far in the future so refresh never fires. */
const NON_EXPIRING = () => Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActorAny(req, res, [Permission.AdminManageUsers, Permission.AdminM365Manage]);
  if (!actor) return;

  const providers = defaultResearchProviders();
  const store = new DbTokenStore(prisma as unknown as ConnectorCredentialClient, { encryptSecret, decryptSecret });

  if (req.method === "GET") {
    const rows = await prisma.orgConnectorCredential.findMany({
      where: { organizationId: actor.organizationId, connectorId: { in: providers.map((p) => p.id) } },
      select: { connectorId: true, status: true, accountLabel: true, lastRefreshedAt: true },
    });
    const byId = new Map(rows.map((r) => [r.connectorId, r]));
    const catalog = providers.map((p) => {
      const row = byId.get(p.id);
      return {
        id: p.id,
        label: p.label,
        type: p.type,
        jurisdictions: p.jurisdictions,
        requiresCredential: p.requiresCredential,
        connected: row?.status === "connected",
        status: row?.status ?? "not_connected",
        accountLabel: row?.accountLabel ?? null,
        lastRefreshedAt: row?.lastRefreshedAt ?? null,
      };
    });
    return res.status(200).json({ ok: true, providers: catalog });
  }

  if (req.method === "POST") {
    const body = (req.body || {}) as { connectorId?: unknown; apiKey?: unknown; clear?: unknown };
    const connectorId = String(body.connectorId || "").trim();
    const provider = providers.find((p) => p.id === connectorId);
    if (!provider) return res.status(400).json({ ok: false, error: `Unknown research connector "${connectorId}"` });

    if (body.clear === true) {
      await store.delete(actor.organizationId, connectorId);
      await logAudit({
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorType: "USER",
        action: "one_legal.research_connector.key_cleared",
        resourceType: "OrgConnectorCredential",
        resourceId: connectorId,
        metadata: { source: "admin", provider: provider.label },
      });
      return res.status(200).json({ ok: true, connectorId, connected: false });
    }

    const apiKey = String(body.apiKey || "").trim();
    if (!apiKey) return res.status(400).json({ ok: false, error: "apiKey is required (or pass clear:true)" });

    const token: TokenSet = { accessToken: apiKey, expiresAt: NON_EXPIRING() };
    await store.put(actor.organizationId, connectorId, token);
    await logAudit({
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "one_legal.research_connector.key_set",
      resourceType: "OrgConnectorCredential",
      resourceId: connectorId,
      // Never log the key itself — only that one was set and by whom.
      metadata: { source: "admin", provider: provider.label },
    });
    return res.status(200).json({ ok: true, connectorId, connected: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
