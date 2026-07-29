/**
 * GET /api/contracts/obligations — the portfolio-wide contract-obligation
 * queue (the CLM obligation ledger). Query filters:
 *   ?status=OPEN|IN_PROGRESS|MET|BREACHED|WAIVED
 *   ?ownerId=<personId>
 *   ?overdue=1
 *   ?dueWithinDays=<n>
 * Read-gated on contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listObligations } from "@aegis/contracts";

const STATUSES = new Set(["OPEN", "IN_PROGRESS", "MET", "BREACHED", "WAIVED"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const status = typeof req.query.status === "string" && STATUSES.has(req.query.status) ? req.query.status : undefined;
    const ownerId = typeof req.query.ownerId === "string" && req.query.ownerId ? req.query.ownerId : undefined;
    const overdueOnly = req.query.overdue === "1" || req.query.overdue === "true";
    const dueWithinDays =
      typeof req.query.dueWithinDays === "string" && /^\d+$/.test(req.query.dueWithinDays)
        ? Number(req.query.dueWithinDays)
        : undefined;
    const queue = await listObligations(user.organizationId, {
      status: status as never,
      ownerId,
      overdueOnly,
      dueWithinDays,
    });
    return res.status(200).json({ ok: true, ...queue });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
