/**
 * GET /api/contracts/analytics — contract portfolio analytics for the GC
 * dashboard: totals & value, distributions (status/risk/type), cycle time,
 * value-at-risk, renewal forecast, obligation compliance, clause-deviation
 * frequency, and counterparty concentration. Read-only; contracts:read_all.
 *
 * Optional ?horizon=<days> controls the renewal-forecast window (default 180,
 * clamped 30–730).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractAnalyticsService } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const raw = Number(Array.isArray(req.query.horizon) ? req.query.horizon[0] : req.query.horizon);
    const renewalHorizonDays = Number.isFinite(raw) ? Math.min(730, Math.max(30, Math.round(raw))) : 180;
    const analytics = await getContractAnalyticsService(user.organizationId, { renewalHorizonDays });
    return res.status(200).json({ ok: true, analytics });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
