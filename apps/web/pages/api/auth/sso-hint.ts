/**
 * GET /api/auth/sso-hint?email=<addr> — home-realm discovery (C-6).
 *
 * A login page calls this to find whether an email's domain federates to
 * a tenant IdP, then redirects to `/api/auth/login?connection=<name>`.
 * Public and pre-auth by design (it's a login affordance). It returns
 * only the non-secret connection name + label + protocol, never anything
 * that identifies a user, so there's nothing to leak beyond "this domain
 * uses SSO" — which the login redirect would reveal anyway.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { matchConnectionByEmail } from "@aegis/auth";
import { prisma } from "@aegis/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (!email || !email.includes("@")) {
    return res.status(400).json({ ok: false, error: "A valid email is required." });
  }

  const rows = await prisma.organizationSsoConnection.findMany({
    where: { enabled: true },
    select: {
      organizationId: true,
      connectionName: true,
      emailDomains: true,
      defaultRoleName: true,
      jitProvisioning: true,
      enabled: true,
      displayName: true,
      protocol: true,
    },
  });
  const match = matchConnectionByEmail(email, rows);
  if (!match) {
    return res.status(200).json({ ok: true, sso: false });
  }
  const full = rows.find((r) => r.organizationId === match.organizationId)!;
  return res.status(200).json({
    ok: true,
    sso: true,
    connection: full.connectionName,
    displayName: full.displayName,
    protocol: full.protocol,
    loginUrl: `/api/auth/login?connection=${encodeURIComponent(full.connectionName)}`,
  });
}
