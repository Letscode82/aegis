/**
 * /api/contract-review/[token]/comment — the external counterparty's SHARED
 * comment thread on the review link. The token is the gate (no auth).
 *   GET  — list the SHARED comments visible on this link.
 *   POST — add a SHARED comment. Body { body, clauseId? }. Consent required.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { submitReviewComment, listReviewComments } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = String(req.query.token || "");

  if (req.method === "GET") {
    const comments = await listReviewComments(token);
    return res.status(200).json({ ok: true, comments });
  }
  if (req.method === "POST") {
    const body = typeof req.body?.body === "string" ? req.body.body.slice(0, 4000) : "";
    const clauseId = req.body?.clauseId ? String(req.body.clauseId) : null;
    const result = await submitReviewComment(token, { body, clauseId });
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    return res.status(200).json({ ok: true, comment: result.comment });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
