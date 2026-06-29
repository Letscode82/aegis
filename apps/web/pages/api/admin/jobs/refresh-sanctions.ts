/**
 * POST /api/admin/jobs/refresh-sanctions
 *
 * Refreshes the sanctions screening list from the live US Treasury OFAC
 * SDN feed. Same pg-boss-ready admin trigger pattern as the
 * defensibility + SLA-scan jobs: manual admin button or external
 * scheduler today; pg-boss.schedule() points at refreshSanctionsList()
 * directly when the worker runtime ships.
 *
 * Source selection:
 *   - default: live OFAC SDN feed (makeOfacSdnFetcher)
 *   - on fetch/parse failure (network blocked, feed down): falls back to
 *     the bootstrap list so a refresh never wipes the table to nothing
 *   - ?source=bootstrap forces the bootstrap list (demo/offline)
 *
 * The response reports which source actually populated the list.
 * Gated by admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { refreshSanctionsList } from "@aegis/intake/sanctions";
import { bootstrapFetcher } from "@aegis/intake/sanctions-bootstrap";
import { makeOfacSdnFetcher } from "@aegis/intake/sanctions-ofac";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  const forceBootstrap = req.query.source === "bootstrap";

  try {
    if (!forceBootstrap) {
      try {
        const result = await refreshSanctionsList(makeOfacSdnFetcher());
        return res.status(200).json({ ok: true, source: "OFAC-SDN-live", sources: result });
      } catch (feedErr) {
        // Live feed unreachable (sandbox / outage) — never leave the
        // table empty; fall back to the bootstrap list and say so.
        console.error("[jobs/refresh-sanctions] live OFAC feed failed, falling back to bootstrap:", feedErr);
        const result = await refreshSanctionsList(bootstrapFetcher);
        return res.status(200).json({
          ok: true,
          source: "bootstrap-fallback",
          warning: `Live OFAC feed unavailable (${feedErr instanceof Error ? feedErr.message : String(feedErr)}); used bootstrap list.`,
          sources: result,
        });
      }
    }
    const result = await refreshSanctionsList(bootstrapFetcher);
    return res.status(200).json({ ok: true, source: "bootstrap", sources: result });
  } catch (err) {
    console.error("[jobs/refresh-sanctions] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
