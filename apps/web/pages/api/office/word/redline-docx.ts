/**
 * POST /api/office/word/redline-docx — download the redline as a real
 * track-changes Word document.
 *
 * Same body as /api/office/word/redline. Produces a `.docx` whose insertions
 * and deletions are genuine Word revisions (`<w:ins>` / `<w:del>`) attributed
 * to "OneLegal Redline", so counsel opens it in Word and accepts or rejects each
 * change. Gated on contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { redlineClause, RedlineValidationError } from "@aegis/contracts";
import { renderRedlineDocx, redlineDocxFilename } from "@aegis/documents";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const b = req.body ?? {};
  const clauseLabel = typeof b.clauseLabel === "string" && b.clauseLabel.trim() ? b.clauseLabel.trim() : null;
  const title = clauseLabel || "Clause redline";
  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await redlineClause(
      user.organizationId,
      {
        original: typeof b.original === "string" ? b.original : "",
        instruction: typeof b.instruction === "string" ? b.instruction : "",
        clauseType: typeof b.clauseType === "string" ? b.clauseType : null,
        clauseLabel,
        contractId: typeof b.contractId === "string" ? b.contractId : null,
      },
      { id: user.id, type: "USER" },
    );

    const buffer = await renderRedlineDocx({
      title,
      clauseLabel,
      segments: result.segments,
      author: "OneLegal Redline",
      generatedAt: new Date().toISOString(),
      generatedBy: user.name ?? user.email ?? null,
      rationale: result.rationale,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${redlineDocxFilename(title)}"`);
    res.setHeader("X-Aegis-Redline-Degraded", String(result.degraded));
    return res.status(200).send(buffer);
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof RedlineValidationError) return res.status(400).json({ ok: false, error: err.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
