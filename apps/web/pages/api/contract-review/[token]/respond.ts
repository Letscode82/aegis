/**
 * POST /api/contract-review/[token]/respond — the counterparty submits
 * a response: body { decision: "ACCEPT" | "COUNTER" | "COMMENT", comment? }.
 * Token-scoped (no permission gate). Requires prior consent. ACCEPT /
 * COUNTER close the link; COMMENT keeps it open for further rounds.
 * Chain-sealed; NEVER mutates the contract's status — internal review
 * still gates.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { submitReviewResponse } from "@aegis/contracts";

const VALID = new Set(["ACCEPT", "COUNTER", "COMMENT"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const token = String(req.query.token || "");
  const decision = String(req.body?.decision || "");
  if (!VALID.has(decision)) return res.status(400).json({ ok: false, error: "decision must be ACCEPT, COUNTER, or COMMENT" });
  const comment = typeof req.body?.comment === "string" ? req.body.comment.slice(0, 4000) : null;

  const result = await submitReviewResponse(token, { decision: decision as never, comment });
  if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
  return res.status(200).json({ ok: true });
}
