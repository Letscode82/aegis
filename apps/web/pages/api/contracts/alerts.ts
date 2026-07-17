/**
 * GET /api/contracts/alerts — contract renewal / expiry / obligation key-
 * date alerts. Pure read aggregation, gated contracts:read_all. Feeds the
 * Mission Control "Contract key dates" card.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractAlerts } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }
  const alerts = await getContractAlerts(user.organizationId);
  return res.status(200).json({ ok: true, ...alerts });
}
