/**
 * POST /api/contracts/author — author a new DRAFT contract from a template
 * (or a blank/explicit body). CLM Phase 4a.
 *
 * Body { title, type, templateKey?, body?, counterpartyId?, matterId?,
 *        value?, currency?, governingLaw?, variables? }.
 * Creates the contract, persists the rendered draft body, and runs the
 * shared extractor (clauses + obligations + v1 snapshot) — all chain-sealed.
 * Gated on contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { authorContractFromTemplate } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const b = req.body ?? {};
  if (!String(b.title || "").trim()) return res.status(400).json({ ok: false, error: "title is required" });
  if (!String(b.type || "").trim()) return res.status(400).json({ ok: false, error: "type is required" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await authorContractFromTemplate(
      user.organizationId,
      {
        title: String(b.title),
        type: String(b.type),
        templateKey: b.templateKey ?? null,
        body: b.body ?? null,
        counterpartyId: b.counterpartyId ?? null,
        matterId: b.matterId ?? null,
        value: b.value == null || b.value === "" ? null : Number(b.value),
        currency: b.currency ?? null,
        governingLaw: b.governingLaw ?? null,
        variables: b.variables && typeof b.variables === "object" ? b.variables : undefined,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
