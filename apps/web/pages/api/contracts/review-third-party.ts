/**
 * POST /api/contracts/review-third-party — intake an inbound third-party
 * contract (the counterparty's paper) and start the internal-legal review +
 * signing ladder. Body { title, type, counterpartyId?, text, value?, currency?,
 * governingLaw? }. Gated contracts:create; chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { reviewThirdPartyContract } from "@aegis/contracts";

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
    const result = await reviewThirdPartyContract(
      user.organizationId,
      {
        title: String(b.title ?? ""),
        type: String(b.type ?? "Third-party"),
        counterpartyId: b.counterpartyId || null,
        text: String(b.text ?? ""),
        value: b.value != null && Number.isFinite(Number(b.value)) ? Number(b.value) : null,
        currency: b.currency || "USD",
        governingLaw: b.governingLaw || null,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
