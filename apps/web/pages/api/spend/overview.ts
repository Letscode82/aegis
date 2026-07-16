/**
 * GET /api/spend/overview — GC legal-spend dashboard data.
 *
 * Firms, invoices (each scrubbed through the review engine for flag
 * counts + AI-proposed savings), budgets, and rolled-up totals in one
 * round-trip. Pure read aggregation, gated on spend:read_all (same
 * posture as /api/ai-ops/summary).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getSpendOverview } from "@aegis/spend";

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
    if (err instanceof AccessDeniedError)
      return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }
  const overview = await getSpendOverview(user.organizationId);
  return res.status(200).json({ ok: true, overview });
}
