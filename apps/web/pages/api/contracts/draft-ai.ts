/**
 * POST /api/contracts/draft-ai — draft a full contract from a plain-language
 * brief + key terms. Creates it as a DRAFT (the human reviews + runs the
 * approval ladder). Degrades to a deterministic skeleton if the model is
 * unavailable. Gated contracts:create; chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { draftContractWithAI } from "@aegis/contracts";

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
    const result = await draftContractWithAI(
      user.organizationId,
      {
        title: String(b.title ?? ""),
        type: String(b.type ?? "Contract"),
        counterpartyId: b.counterpartyId || null,
        counterpartyName: b.counterpartyName || null,
        brief: String(b.brief ?? ""),
        value: b.value != null && Number.isFinite(Number(b.value)) ? Number(b.value) : null,
        currency: b.currency || "USD",
        governingLaw: b.governingLaw || null,
        paymentTerms: b.paymentTerms || null,
        termMonths: b.termMonths != null && Number.isFinite(Number(b.termMonths)) ? Number(b.termMonths) : null,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
