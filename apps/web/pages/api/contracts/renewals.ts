/**
 * GET /api/contracts/renewals — the renewal command center feed.
 * Every live contract with an expiry, bucketed by renewal urgency (auto-renewal
 * traps first), each with the exact act-by date. Read-only; contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getRenewalPipeline } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const horizonDays = Number(req.query.horizonDays);
    const pipeline = await getRenewalPipeline(
      user.organizationId,
      Number.isFinite(horizonDays) && horizonDays > 0 ? { horizonDays } : {},
    );
    return res.status(200).json({ ok: true, pipeline });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
