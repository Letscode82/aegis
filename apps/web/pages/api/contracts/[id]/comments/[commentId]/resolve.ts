/**
 * POST /api/contracts/[id]/comments/[commentId]/resolve — mark a comment thread
 * resolved (or reopen with { resolved: false }). Gated contracts:create;
 * chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { setContractCommentResolved } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const commentId = String(req.query.commentId || "");
  const resolved = req.body?.resolved !== false; // default true

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await setContractCommentResolved(user.organizationId, commentId, resolved, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
