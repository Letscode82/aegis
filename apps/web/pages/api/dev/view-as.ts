/**
 * /api/dev/view-as — the dev-mode "View as role" switcher (program #4).
 *
 * GET  → { enabled, users: [{email,name,roleName}], current }
 * POST → { email }  sets the aegis_dev_view_as cookie (empty clears it)
 *
 * DISABLED WHEN AUTH0 IS CONFIGURED. In production real sessions decide
 * identity; this endpoint 403s so it can never impersonate a user.
 * In dev mode it just picks which seeded role user getResolvedUser
 * resolves — the whole app then role-gates around that user, which is
 * how "each team sees their own view" is demonstrated.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@aegis/db";
import { isAuth0Configured, getResolvedUser, DEV_VIEW_AS_COOKIE } from "@aegis/auth/server";

function readCookie(header: string | undefined, name: string): string {
  if (!header) return "";
  const m = header.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (isAuth0Configured()) {
    return res.status(403).json({ ok: false, error: "View-as is dev-mode only (Auth0 is configured)." });
  }

  // Resolve current org via the (default) resolved user.
  const me = await getResolvedUser(req, res);
  if (!me) return res.status(401).json({ ok: false, error: "No session" });

  if (req.method === "GET") {
    const users = await prisma.user.findMany({
      where: { organizationId: me.organizationId, suspendedAt: null },
      include: { role: true },
      orderBy: { name: "asc" },
    });
    const current = readCookie(req.headers.cookie, DEV_VIEW_AS_COOKIE);
    return res.status(200).json({
      ok: true,
      enabled: true,
      current,
      users: users.map((u) => ({ email: u.email, name: u.name, roleName: u.role?.name || "—" })),
    });
  }

  if (req.method === "POST") {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const maxAge = email ? 60 * 60 * 24 * 7 : 0; // 0 clears
    res.setHeader(
      "Set-Cookie",
      `${DEV_VIEW_AS_COOKIE}=${encodeURIComponent(email)}; Path=/; SameSite=Lax; Max-Age=${maxAge}`,
    );
    return res.status(200).json({ ok: true, current: email });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
