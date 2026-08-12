/**
 * /api/contracts/[id]/signature-requests
 *   GET  — list e-signature requests for the contract. contracts:read_all.
 *   POST — issue a signing request + link. Body { party, signerName,
 *          signerEmail?, signingOrder? }. Gated contracts:execute (issuing a
 *          request to sign is an execution action). Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { requestSignature, listSignatureRequests } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const requests = await listSignatureRequests(user.organizationId, contractId);
      return res.status(200).json({ ok: true, requests });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsExecute);
      const b = req.body ?? {};
      const minted = await requestSignature(
        user.organizationId,
        contractId,
        {
          party: b.party === "COUNTERPARTY" ? "COUNTERPARTY" : "INTERNAL",
          signerName: String(b.signerName ?? ""),
          signerEmail: b.signerEmail || null,
          signingOrder: b.signingOrder != null ? Number(b.signingOrder) : 1,
        },
        { id: user.id, type: "USER" },
      );
      return res.status(200).json({ ok: true, ...minted });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
