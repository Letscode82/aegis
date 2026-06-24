/**
 * POST /api/admin/jobs/refresh-sanctions
 *
 * Refreshes the sanctions screening list. Same pg-boss-ready admin
 * trigger pattern as the defensibility + SLA-scan jobs: manual admin
 * button or external scheduler today; pg-boss.schedule() points at
 * refreshSanctionsList() directly when the worker runtime ships.
 *
 * The fetcher is the swap point for production: today it loads the
 * bootstrap set (real OFAC-listed names); a deployed environment points
 * it at the live US Treasury SDN feed. The screening logic and this
 * trigger don't change — only the fetcher.
 *
 * Gated by admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { refreshSanctionsList } from "@aegis/intake/sanctions";
import { bootstrapFetcher } from "@aegis/intake/sanctions-bootstrap";
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
  try {
    // PRODUCTION: replace bootstrapFetcher with a live OFAC SDN fetcher.
    const result = await refreshSanctionsList(bootstrapFetcher);
    return res.status(200).json({ ok: true, sources: result });
  } catch (err) {
    console.error("[jobs/refresh-sanctions] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
