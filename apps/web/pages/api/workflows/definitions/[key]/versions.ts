/**
 * GET  /api/workflows/definitions/[key]/versions — snapshot history
 *      (newest first). Any authenticated org member (Designer reads).
 * POST /api/workflows/definitions/[key]/versions/revert is handled by
 *      the sibling revert route.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { listWorkflowVersions } from "@aegis/workflow";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const versions = await listWorkflowVersions(user.organizationId, String(req.query.key));
  return res.status(200).json({ ok: true, versions });
}
