/**
 * /api/contracts/[id]/comments
 *   GET  — list comments (internal audience: all threads). contracts:read_all.
 *   POST — add a comment. Body { body, clauseId?, parentId?, visibility }.
 *          visibility INTERNAL (business ↔ legal, private) or SHARED (visible to
 *          the counterparty on the review portal). contracts:create.
 * Chain-sealed by the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { addContractComment, listContractComments } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const comments = await listContractComments(user.organizationId, contractId, "internal");
      return res.status(200).json({ ok: true, comments });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsCreate);
      const b = req.body ?? {};
      const comment = await addContractComment(
        user.organizationId,
        contractId,
        {
          body: String(b.body ?? ""),
          clauseId: b.clauseId || null,
          parentId: b.parentId || null,
          visibility: b.visibility === "SHARED" ? "SHARED" : "INTERNAL",
        },
        { id: user.id, type: "USER" },
      );
      return res.status(200).json({ ok: true, comment });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
