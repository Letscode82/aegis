/**
 * Internal counterparty-review management for one contract.
 *   GET    — review activity (tokens + chain-sealed counterparty events).
 *            Gated contracts:read_all.
 *   POST   — mint a review link for a counterparty contact.
 *            body { personId, expiresInDays? } → { url }. Gated contracts:create.
 *   DELETE — revoke a link. body { tokenId }. Gated contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractReviewActivity, mintContractReviewToken, revokeContractReviewToken } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const activity = await getContractReviewActivity(user.organizationId, contractId);
      return res.status(200).json({ ok: true, activity });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsCreate);
      const personId = String(req.body?.personId || "");
      if (!personId) return res.status(400).json({ ok: false, error: "personId is required" });
      const expiresInDays = Number(req.body?.expiresInDays) || undefined;
      const minted = await mintContractReviewToken(user.organizationId, contractId, personId, { expiresInDays }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, url: minted.url, tokenId: minted.id, expiresAt: minted.expiresAt });
    }
    if (req.method === "DELETE") {
      assertUserCanDo(user, Permission.ContractsCreate);
      const tokenId = String(req.body?.tokenId || "");
      if (!tokenId) return res.status(400).json({ ok: false, error: "tokenId is required" });
      await revokeContractReviewToken(user.organizationId, tokenId, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
