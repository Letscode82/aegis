/**
 * POST /api/contract-review/[token]/consent — the counterparty accepts
 * the confidentiality / terms-of-review notice before seeing the draft.
 * Token-scoped (no permission gate); chain-sealed inside the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { recordReviewConsent } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const token = String(req.query.token || "");
  const ok = await recordReviewConsent(token);
  if (!ok) return res.status(404).json({ ok: false, error: "This review link is no longer valid." });
  return res.status(200).json({ ok: true });
}
