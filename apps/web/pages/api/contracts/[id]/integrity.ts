/**
 * /api/contracts/[id]/integrity
 *   GET  — full integrity verdict for one contract (sealed baseline vs live
 *          fingerprint, per-signature match, post-execution material changes).
 *          contracts:read_all.
 *   POST — seal (or re-seal) the current terms as the tamper-evidence baseline
 *          (adopt integrity on a pre-feature executed contract). contracts:execute.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { checkContractIntegrity, sealContractTerms } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const integrity = await checkContractIntegrity(user.organizationId, contractId);
      return res.status(200).json({ ok: true, integrity });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsExecute);
      const result = await sealContractTerms(user.organizationId, contractId, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, ...result });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
