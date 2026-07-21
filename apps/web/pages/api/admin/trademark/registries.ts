/**
 * GET  /api/admin/trademark/registries  — which registries (USPTO/EUIPO/
 *      WIPO) are configured + local cache health.
 * POST /api/admin/trademark/registries  body: { terms: string[] } — pre-warm
 *      the cache by live-searching those terms across configured registries.
 *
 * Gated on admin:manage_users (platform admin). Live registry access needs
 * the per-registry credentials in env — see docs/trademark-registries.md.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getRegistryStatus, warmRegistries } from "@aegis/intake/trademark";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, ...(await getRegistryStatus()) });
  }
  if (req.method === "POST") {
    const terms = Array.isArray((req.body ?? {}).terms) ? (req.body.terms as string[]) : [];
    if (terms.length === 0) return res.status(400).json({ ok: false, error: "terms[] required" });
    const result = await warmRegistries(terms);
    return res.status(200).json({ ok: true, ...result });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
