/**
 * Execution & signatures (CLM Phase 5d).
 *
 * GET    /api/contracts/[id]/signatures — the signature set + execution
 *        readiness. Gated contracts:read_all.
 * POST   /api/contracts/[id]/signatures — record a signature. Body
 *        { party, signerName, signerEmail?, signerPersonId?, method? }. Both
 *        sides + APPROVED auto-executes. Gated contracts:execute.
 * DELETE /api/contracts/[id]/signatures — remove a signature (pre-execution).
 *        Body { signatureId }. Gated contracts:execute.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractSignatures, recordSignature, removeSignature } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const state = await getContractSignatures(user.organizationId, contractId);
      return res.status(200).json({ ok: true, state });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsExecute);
      const party = String(req.body?.party || "");
      const signerName = String(req.body?.signerName || "");
      if (party !== "INTERNAL" && party !== "COUNTERPARTY") return res.status(400).json({ ok: false, error: "party must be INTERNAL or COUNTERPARTY" });
      if (!signerName.trim()) return res.status(400).json({ ok: false, error: "signerName is required" });
      const state = await recordSignature(user.organizationId, contractId, {
        party, signerName,
        signerEmail: req.body?.signerEmail ?? null,
        signerPersonId: req.body?.signerPersonId ?? null,
        method: req.body?.method ?? "recorded",
      }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, state });
    }
    if (req.method === "DELETE") {
      assertUserCanDo(user, Permission.ContractsExecute);
      const signatureId = String(req.body?.signatureId || "");
      if (!signatureId) return res.status(400).json({ ok: false, error: "signatureId is required" });
      const state = await removeSignature(user.organizationId, contractId, signatureId, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, state });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
