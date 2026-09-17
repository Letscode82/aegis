/**
 * POST /api/spend/counsel/rate-card — replace a firm's rate card.
 *   body { vendorId, ratesCard: { tier: rate, … } }
 * Chain-sealed; increased tiers are called out in the audit metadata.
 * Gated spend:approve_invoice (a spend write grant).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { updateVendorRateCard } from "@aegis/spend";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const vendorId = String(req.body?.vendorId || "");
  const ratesCard = (req.body?.ratesCard && typeof req.body.ratesCard === "object") ? req.body.ratesCard : {};
  if (!vendorId) return res.status(400).json({ ok: false, error: "vendorId is required" });
  try {
    assertUserCanDo(user, Permission.SpendApproveInvoice);
    const result = await updateVendorRateCard(user.organizationId, vendorId, ratesCard, user.id);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
