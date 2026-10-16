/**
 * Graded contract reviews (PR C).
 *   GET  — list reviews for the contract. contracts:read_all.
 *   POST — start a graded review { paperType?, perspective? }. contracts:approve.
 * Chain-sealed inside the service; each actionable finding is human-gated.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { startContractReview, listContractReviews } from "@aegis/contracts";

const PAPER_TYPES = ["THEIR_PAPER", "OUR_PAPER_THEIR_MARKS"] as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const actor = { id: user.id, type: "USER" as const };

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const reviews = await listContractReviews(user.organizationId, contractId);
      return res.status(200).json({ ok: true, reviews });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsApprove);
      const b = req.body ?? {};
      const paperType = (PAPER_TYPES as readonly string[]).includes(b.paperType) ? b.paperType : "THEIR_PAPER";
      const review = await startContractReview(user.organizationId, contractId, { paperType, perspective: b.perspective ?? null }, actor);
      return res.status(200).json({ ok: true, review });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
