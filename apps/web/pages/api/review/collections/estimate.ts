/**
 * POST /api/review/collections/estimate — Purview eDiscovery (Premium)
 * tenant-scale collection estimate (CW-2). Given a custodian list (+ optional
 * KQL), returns how many items / how much data a tenant-wide collection would
 * pull, without pulling per-user. The enterprise-scale complement to the
 * per-user collection that backs the hub's demo. matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { estimatePurviewCollection } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  try {
    const b = req.body ?? {};
    const custodianIdentifiers = Array.isArray(b.custodianIdentifiers)
      ? b.custodianIdentifiers
      : String(b.custodianIdentifiers || b.identifiers || "").split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean);
    const estimate = await estimatePurviewCollection(actor.organizationId, {
      custodianIdentifiers,
      queryString: typeof b.queryString === "string" ? b.queryString : undefined,
      displayName: typeof b.displayName === "string" ? b.displayName : undefined,
    });
    return res.status(200).json({ ok: true, estimate });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
