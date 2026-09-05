/**
 * GET /api/_health/tika — shallow processing-engine health probe.
 *
 * Reports which processing engine the app selects (native / tika / purview)
 * and, when a Tika sidecar is configured, a bounded `/version` probe so you
 * can confirm the app can actually reach it. Mirrors /api/_health/m365.
 *
 * A sleeping sidecar (e.g. Railway app-sleeping) surfaces as
 * `tika.reachable: false` with a timeout message — retry to wake it.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getProcessingStatusForOrg } from "@aegis/matter";
import { getResolvedUser } from "@aegis/auth/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    // Org isn't required to report engine selection, but resolve the user so
    // the shape matches the M365 probe and future per-org modes work.
    const user = await getResolvedUser(req, res).catch(() => null);
    const status = await getProcessingStatusForOrg(user?.organizationId);
    return res.status(200).json({ ok: true, ...status });
  } catch (err) {
    console.error("[/api/_health/tika] failed:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
