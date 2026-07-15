/**
 * GET /api/workflows/running-entities?entityType=intake_ticket
 *
 * Returns the ids of host entities (of the given entityType) that
 * currently have an IN_PROGRESS ladder in the caller's org. The Cockpit
 * uses this to tell dispatched tickets (a ladder is running) from
 * undispatched ones — one call instead of a per-ticket fetch. Any
 * authenticated user in the org may read it (same posture as the
 * per-entity instances GET).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { listRunningInstanceEntityIds } from "@aegis/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const { entityType } = req.query;
  if (typeof entityType !== "string")
    return res.status(400).json({ ok: false, error: "entityType is required" });
  const entityIds = await listRunningInstanceEntityIds(user.organizationId, entityType);
  return res.status(200).json({ ok: true, entityIds });
}
