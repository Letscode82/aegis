/**
 * POST /api/addin/review — Word add-in document grade (PR E).
 *
 * Body { text, contractType?, perspective? }. Extracts clauses from the
 * selected/pasted document text and grades them against the org's resolved
 * playbook, returning the actionable items + suggested redline language the
 * Office.js task pane renders. Stateless. contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { reviewDocumentForAddin } from "@aegis/contracts";

const PERSPECTIVES = new Set(["OUR_SIDE", "THEIR_SIDE", "MUTUAL", "NEUTRAL"]);

// Vercel: AI generation (Claude calls) can run 20-40s; the default ~10s
// function timeout truncates it into a degraded fallback. Give it room.
export const config = { maxDuration: 60 };

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
    const perspective = typeof b.perspective === "string" && PERSPECTIVES.has(b.perspective) ? b.perspective : null;
    const review = await reviewDocumentForAddin(
      user.organizationId,
      { text: String(b.text ?? ""), contractType: b.contractType ?? null, perspective: perspective as never },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, review });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
