/**
 * POST /api/contracts/[id]/versions/apply-redline — apply a reviewer's
 * accept/reject decisions over the `from → to` version redline and persist the
 * merged clause set as a new MANUAL version. Chain-sealed inside the service.
 *
 * body { fromVersion, toVersion, decisions, label? }. The accept/reject is the
 * human gate, so this is gated contracts:approve — the same permission that
 * resolves a clause remediation.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { applyVersionRedlineReview, type RedlineReviewDecisions } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const body = (req.body || {}) as { fromVersion?: number; toVersion?: number; decisions?: RedlineReviewDecisions; label?: string };
    const fromVersion = Number(body.fromVersion);
    const toVersion = Number(body.toVersion);
    if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion) || fromVersion === toVersion) {
      return res.status(400).json({ ok: false, error: "from and to versions are required and must differ" });
    }
    const result = await applyVersionRedlineReview(
      user.organizationId,
      contractId,
      { fromVersion, toVersion, decisions: body.decisions || {}, label: body.label },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
