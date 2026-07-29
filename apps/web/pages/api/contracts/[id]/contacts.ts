/**
 * POST /api/contracts/[id]/contacts — add a counterparty contact for this
 * contract's counterparty (CLM Phase 5a). Body { name, email? }.
 *
 * Resolves the contract's counterparty and creates a COUNTERPARTY_CONTACT
 * Person linked to it (chain-sealed) so the review round-trip can invite
 * them. Requires the contract to have a counterparty set. Gated on
 * contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@aegis/db";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { createCounterpartyContact } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const name = String(req.body?.name || "");
  const email = req.body?.email ? String(req.body.email) : null;
  if (!name.trim()) return res.status(400).json({ ok: false, error: "Contact name is required" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, organizationId: user.organizationId },
      select: { counterpartyId: true },
    });
    if (!contract) return res.status(404).json({ ok: false, error: "Contract not found" });
    if (!contract.counterpartyId)
      return res.status(400).json({ ok: false, error: "Set a counterparty on the contract first, then add contacts." });

    const contact = await createCounterpartyContact(
      user.organizationId,
      { counterpartyId: contract.counterpartyId, name, email },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, contact });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
