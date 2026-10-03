/**
 * GET|PUT|DELETE /api/admin/sso/connections — manage the caller org's
 * per-tenant SSO connection (C-6). One connection per org.
 *
 *   GET    → the org's connection (or null).
 *   PUT    → upsert it; body { displayName, protocol?, connectionName,
 *            emailDomains[], defaultRoleName?, jitProvisioning?, enabled? }.
 *   DELETE → remove it.
 *
 * Every mutation writes a chain-sealed audit row. Gated by
 * `admin:manage_users` — the same identity-administration permission that
 * governs who can sign in; SSO config decides how they sign in.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, ALL_ROLES } from "@aegis/auth";
import { prisma, logAudit } from "@aegis/db";
import { requireActor } from "../../../../lib/matter-actor";

const PROTOCOLS = ["OIDC", "SAML"] as const;
type Protocol = (typeof PROTOCOLS)[number];

function sanitizeDomains(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const d = raw.trim().toLowerCase().replace(/^@/, "");
    if (d && d.includes(".") && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  const organizationId = actor.organizationId;

  if (req.method === "GET") {
    const row = await prisma.organizationSsoConnection.findUnique({
      where: { organizationId },
    });
    return res.status(200).json({ ok: true, connection: row ?? null });
  }

  if (req.method === "PUT") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const connectionName =
      typeof body.connectionName === "string" ? body.connectionName.trim() : "";
    const protocol: Protocol = PROTOCOLS.includes(body.protocol as Protocol)
      ? (body.protocol as Protocol)
      : "OIDC";
    const emailDomains = sanitizeDomains(body.emailDomains);
    const defaultRoleName =
      typeof body.defaultRoleName === "string" &&
      (ALL_ROLES as readonly string[]).includes(body.defaultRoleName)
        ? body.defaultRoleName
        : "requester";
    const jitProvisioning = body.jitProvisioning !== false;
    const enabled = body.enabled !== false;

    if (!displayName || !connectionName || emailDomains.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "displayName, connectionName, and at least one valid email domain are required.",
      });
    }

    const before = await prisma.organizationSsoConnection.findUnique({
      where: { organizationId },
    });
    const row = await prisma.organizationSsoConnection.upsert({
      where: { organizationId },
      update: { displayName, protocol, connectionName, emailDomains, defaultRoleName, jitProvisioning, enabled },
      create: { organizationId, displayName, protocol, connectionName, emailDomains, defaultRoleName, jitProvisioning, enabled },
    });

    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: before ? "auth.sso.connection.updated" : "auth.sso.connection.created",
      resourceType: "OrganizationSsoConnection",
      resourceId: row.id,
      beforeJson: before
        ? { connectionName: before.connectionName, emailDomains: before.emailDomains, defaultRoleName: before.defaultRoleName, enabled: before.enabled, jitProvisioning: before.jitProvisioning }
        : undefined,
      afterJson: { connectionName, emailDomains, defaultRoleName, enabled, jitProvisioning, protocol },
      metadata: { source: "admin-sso" },
    });

    return res.status(200).json({ ok: true, connection: row });
  }

  if (req.method === "DELETE") {
    const before = await prisma.organizationSsoConnection.findUnique({
      where: { organizationId },
    });
    if (!before) return res.status(200).json({ ok: true, deleted: false });
    await prisma.organizationSsoConnection.delete({ where: { organizationId } });
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "auth.sso.connection.deleted",
      resourceType: "OrganizationSsoConnection",
      resourceId: before.id,
      beforeJson: { connectionName: before.connectionName, emailDomains: before.emailDomains },
      metadata: { source: "admin-sso" },
    });
    return res.status(200).json({ ok: true, deleted: true });
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
