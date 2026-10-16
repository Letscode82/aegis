/**
 * POST /api/addin/redline — Word add-in single-clause redline (PR E).
 *
 * Body { original, instruction, clauseType?, clauseLabel? }. Rewrites the
 * selected clause on our standard per the instruction and returns the
 * track-changes segments the task pane renders as Word insertions/deletions.
 * Degrades to a no-op when Claude is unavailable. contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { redlineForAddin, RedlineValidationError } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const b = req.body ?? {};
    const result = await redlineForAddin(
      user.organizationId,
      { original: String(b.original ?? ""), instruction: String(b.instruction ?? ""), clauseType: b.clauseType ?? null, clauseLabel: b.clauseLabel ?? null },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof RedlineValidationError) return res.status(400).json({ ok: false, error: err.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
