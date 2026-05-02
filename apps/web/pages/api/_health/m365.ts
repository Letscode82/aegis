/**
 * GET /api/_health/m365 — shallow health probe.
 *
 * Reports whether M365 credentials resolve for the current actor's
 * org. Does NOT call Graph (so a downed Graph endpoint doesn't
 * trigger health alerts). For deep health, see
 * /api/admin/m365/verify-credentials.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getM365ConnectionStatus } from "@aegis/matter";
import { getResolvedUser } from "@aegis/auth/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Health endpoints don't gate behind admin permissions but we still
  // need an org id. Resolve the user; fall back to a generic "no
  // session" response that Vercel's uptime probe can still treat as
  // "service is up".
  try {
    const user = await getResolvedUser(req, res);
    if (!user) {
      return res.status(200).json({
        ok: true,
        mode: "anonymous",
        configured: null,
        message: "no session — health is service-level only",
      });
    }
    const status = await getM365ConnectionStatus(user.organizationId);
    return res.status(200).json({
      ok: true,
      mode: status.mode,
      configured: status.configured,
      tenantIdMasked: status.tenantIdMasked,
      lastVerifiedAt: status.lastVerifiedAt,
    });
  } catch (err) {
    console.error("[/api/_health/m365] failed:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
