/**
 * PUT /api/contracts/[id]/draft — edit the working draft body (scope of
 * services) and re-extract the clause set into a new version. Body { draftText }.
 * Chain-sealed (contract.draft_updated + the re-extraction rows). CLM Phase 5c.
 * Gated on contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { updateContractDraft } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PUT" && req.method !== "POST") {
    res.setHeader("Allow", "PUT, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const draftText = String(req.body?.draftText || "");
  if (!draftText.trim()) return res.status(400).json({ ok: false, error: "draftText is required" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await updateContractDraft(user.organizationId, contractId, draftText, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
