/**
 * GET   /api/contracts/[id] — one contract with its extracted clauses and
 *       its obligations (shared Obligation entity). Gated contracts:read_all.
 * PATCH /api/contracts/[id] — edit metadata fields (title, counterparty,
 *       value, dates, governing law, …). Body { patch }. Chain-sealed
 *       contract.updated with a per-field diff. Gated contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractDetail, updateContract, type UpdateContractInput } from "@aegis/contracts";

const toDate = (v: unknown): Date | null | undefined =>
  v === undefined ? undefined : v === null || v === "" ? null : new Date(String(v));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const contract = await getContractDetail(user.organizationId, contractId);
      if (!contract) return res.status(404).json({ ok: false, error: "Contract not found" });
      return res.status(200).json({ ok: true, contract });
    }

    if (req.method === "PATCH") {
      assertUserCanDo(user, Permission.ContractsCreate);
      const b = (req.body ?? {}) as Record<string, unknown>;
      const patch: UpdateContractInput = {};
      if ("title" in b) patch.title = String(b.title ?? "");
      if ("type" in b) patch.type = String(b.type ?? "");
      if ("counterpartyId" in b) patch.counterpartyId = b.counterpartyId ? String(b.counterpartyId) : null;
      if ("currency" in b) patch.currency = String(b.currency ?? "USD");
      if ("value" in b) patch.value = b.value === null || b.value === "" ? null : Number(b.value);
      if ("effectiveDate" in b) patch.effectiveDate = toDate(b.effectiveDate);
      if ("expiryDate" in b) patch.expiryDate = toDate(b.expiryDate);
      if ("autoRenew" in b) patch.autoRenew = Boolean(b.autoRenew);
      if ("noticeWindowDays" in b) patch.noticeWindowDays = b.noticeWindowDays === null || b.noticeWindowDays === "" ? null : Number(b.noticeWindowDays);
      if ("governingLaw" in b) patch.governingLaw = b.governingLaw ? String(b.governingLaw) : null;
      await updateContract(user.organizationId, contractId, patch, { id: user.id, type: "USER" });
      const contract = await getContractDetail(user.organizationId, contractId);
      return res.status(200).json({ ok: true, contract });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
