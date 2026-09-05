/**
 * GET /api/admin/m365/ediscovery/explore[?caseId=...&reviewSetId=...]
 *
 * PROC-7b (increment 1) — read-only Purview eDiscovery explorer. Walks
 * cases → custodians / searches / reviewSets → a best-effort review-set item
 * probe, so we can map Purview's processed output into AEGIS review items.
 *
 * Read-only; creates/mutates nothing. Requires admin:m365:manage (it drives a
 * delegated Graph call, same posture as delegated-test).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { exploreEdiscovery } from "@aegis/matter";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActorAny(req, res, [Permission.AdminM365Manage]);
  if (!actor) return;

  const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
  const reviewSetId = typeof req.query.reviewSetId === "string" ? req.query.reviewSetId : undefined;

  try {
    const result = await exploreEdiscovery(actor.organizationId, { caseId, reviewSetId });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(502).json({ ok: false, error: { code: "EDISCOVERY_EXPLORE_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
