/**
 * GET /api/spend/analytics — GC spend analytics roll-up: reduction /
 * realization rate, review cycle time, budget accuracy, spend by matter +
 * practice. Pure reads; gated spend:read_all (same as the overview).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getSpendAnalytics } from "@aegis/spend";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.SpendReadAll);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }
  const analytics = await getSpendAnalytics(user.organizationId);
  return res.status(200).json({ ok: true, analytics });
}
