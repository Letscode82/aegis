/**
 * GET /api/contract-review/[token] — resolve a counterparty review link
 * to its scoped context (contract draft + clauses + obligations). NO
 * permission gate: the token IS the gate (validity + scope re-derived
 * server-side). 404 on any invalid / expired / revoked / used token so
 * the portal shows a single "link no longer valid" state without leaking
 * which case it was.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { resolveContractReviewToken } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const token = String(req.query.token || "");
  const ctx = await resolveContractReviewToken(token);
  if (!ctx) return res.status(404).json({ ok: false, error: "This review link is no longer valid." });
  return res.status(200).json({ ok: true, context: ctx });
}
