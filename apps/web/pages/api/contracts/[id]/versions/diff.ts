/**
 * GET /api/contracts/[id]/versions/diff?from=1&to=2 — the redline between
 * two contract versions (clauses added / removed / changed). contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { diffContractVersions } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return res.status(400).json({ ok: false, error: "from and to versions are required" });

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }
  const diff = await diffContractVersions(user.organizationId, contractId, from, to);
  if (!diff) return res.status(404).json({ ok: false, error: "One or both versions not found" });
  return res.status(200).json({ ok: true, diff });
}
