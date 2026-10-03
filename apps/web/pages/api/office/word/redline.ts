/**
 * POST /api/office/word/redline — the Word add-in's redline action.
 *
 * Body { original, instruction, clauseType?, clauseLabel?, contractId? }.
 * Returns the proposed revision plus word-level track-changes segments the
 * add-in applies in-place via Office.js. Gated on contracts:create (drafting
 * assistance); chain-sealed by the service when a contractId is supplied.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { redlineClause, RedlineValidationError } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const b = req.body ?? {};
  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await redlineClause(
      user.organizationId,
      {
        original: typeof b.original === "string" ? b.original : "",
        instruction: typeof b.instruction === "string" ? b.instruction : "",
        clauseType: typeof b.clauseType === "string" ? b.clauseType : null,
        clauseLabel: typeof b.clauseLabel === "string" ? b.clauseLabel : null,
        contractId: typeof b.contractId === "string" ? b.contractId : null,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof RedlineValidationError) return res.status(400).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
