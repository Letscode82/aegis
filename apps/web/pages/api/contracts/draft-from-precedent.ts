/**
 * POST /api/contracts/draft-from-precedent — draft a NEW contract modeled on
 * a prior executed agreement (the guided-draft "draft from precedent" option).
 * Creates it as a DRAFT on our paper; the human reviews + runs the approval
 * ladder. Degrades to a copy-of-precedent skeleton if the model is
 * unavailable. Gated contracts:create; chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { draftFromPrecedent } from "@aegis/contracts";

const PERSPECTIVES = ["OUR_SIDE", "THEIR_SIDE", "MUTUAL", "NEUTRAL"] as const;
type Perspective = (typeof PERSPECTIVES)[number];
function coercePerspective(v: unknown): Perspective | null {
  const s = String(v ?? "").toUpperCase();
  return (PERSPECTIVES as readonly string[]).includes(s) ? (s as Perspective) : null;
}

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
    const result = await draftFromPrecedent(
      user.organizationId,
      {
        precedentContractId: String(b.precedentContractId ?? ""),
        brief: String(b.brief ?? ""),
        title: b.title ? String(b.title) : undefined,
        type: b.type ? String(b.type) : undefined,
        counterpartyId: b.counterpartyId || null,
        counterpartyName: b.counterpartyName || null,
        governingLaw: b.governingLaw || null,
        perspective: coercePerspective(b.perspective),
        specialTerms: b.specialTerms ? String(b.specialTerms) : null,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
