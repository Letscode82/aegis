/**
 * POST /api/contracts/[id]/obligations — create a contract obligation.
 * Body { description, dueDate?, ownerId?, type?, recurrence? }. Uses the SHARED
 * Obligation entity (sourceType=CONTRACT). Gated on contracts:create;
 * chain-sealed by the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { createObligation } from "@aegis/contracts";

const VALID_TYPES = new Set(["PAYMENT", "DELIVERABLE", "REPORTING", "RENEWAL_NOTICE", "COMPLIANCE", "OTHER"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const b = req.body ?? {};
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (!description) return res.status(400).json({ ok: false, error: "Description is required" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const obligation = await createObligation(
      user.organizationId,
      contractId,
      {
        description,
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        ownerId: b.ownerId || null,
        type: typeof b.type === "string" && VALID_TYPES.has(b.type) ? b.type : "OTHER",
        recurrence: b.recurrence || null,
      },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, id: obligation.id });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
