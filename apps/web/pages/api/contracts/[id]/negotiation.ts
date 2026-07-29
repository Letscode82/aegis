/**
 * Contract negotiation (CLM Phase 4b).
 *
 * GET  /api/contracts/[id]/negotiation
 *   Read the negotiation state — turn history (COUNTERPARTY versions), the
 *   working draft body, and the latest counterparty verdict. Gated on
 *   contracts:read_all.
 *
 * POST /api/contracts/[id]/negotiation   body { draftText, note? }
 *   Apply a counterparty turn: persist the revised draft, re-extract into a
 *   new COUNTERPARTY version, and move to IN_NEGOTIATION when legal. Gated on
 *   contracts:create (revising the draft is a create/edit-grade action).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getNegotiationState, applyCounterpartyTurn } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const state = await getNegotiationState(user.organizationId, contractId);
      return res.status(200).json({ ok: true, state });
    }

    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsCreate);
      const draftText = String(req.body?.draftText || "");
      if (!draftText.trim()) return res.status(400).json({ ok: false, error: "draftText is required" });
      const result = await applyCounterpartyTurn(user.organizationId, contractId, draftText, { id: user.id, type: "USER" }, {
        note: req.body?.note ?? null,
      });
      return res.status(200).json({ ok: true, ...result });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
