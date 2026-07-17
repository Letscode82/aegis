/**
 * GET  /api/contracts/[id]/versions — version history. contracts:read_all.
 * POST /api/contracts/[id]/versions — manual "snapshot now". body { label? }.
 *      contracts:create. Chain-sealed inside the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listContractVersions, snapshotContractVersion } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const versions = await listContractVersions(user.organizationId, contractId);
      return res.status(200).json({ ok: true, versions });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsCreate);
      const label = String(req.body?.label || "").trim() || "Manual snapshot";
      const v = await snapshotContractVersion(user.organizationId, contractId, { label, source: "MANUAL" }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, version: v, unchanged: v === null });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
