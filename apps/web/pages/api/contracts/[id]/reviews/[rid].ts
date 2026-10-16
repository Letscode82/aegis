/**
 * One graded review (PR C).
 *   GET  — review + findings. contracts:read_all.
 *   POST — { action: "apply" } → apply accepted findings into a new version.
 *          contracts:approve.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractReview, applyContractReview } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const rid = String(req.query.rid || "");
  const actor = { id: user.id, type: "USER" as const };

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const review = await getContractReview(user.organizationId, rid);
      if (!review) return res.status(404).json({ ok: false, error: "Review not found" });
      return res.status(200).json({ ok: true, review });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsApprove);
      if ((req.body ?? {}).action === "apply") {
        const review = await applyContractReview(user.organizationId, rid, actor);
        return res.status(200).json({ ok: true, review });
      }
      return res.status(400).json({ ok: false, error: "Unknown action" });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
