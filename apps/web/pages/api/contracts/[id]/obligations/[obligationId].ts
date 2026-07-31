/**
 * /api/contracts/[id]/obligations/[obligationId]
 *
 * POST   — transition status (OPEN → IN_PROGRESS → MET, or BREACHED / WAIVED).
 *          Body { status, reason? }.
 * PUT    — edit details (description / dueDate / ownerId / type / recurrence).
 * DELETE — remove a mistaken obligation.
 *
 * All gated on contracts:create (the CLM author permission); the service
 * chain-seals every mutation.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import {
  updateObligationStatus,
  updateObligationDetails,
  deleteObligation,
  IllegalObligationTransitionError,
} from "@aegis/contracts";

const VALID = new Set(["OPEN", "IN_PROGRESS", "MET", "BREACHED", "WAIVED"]);
const VALID_TYPES = new Set(["PAYMENT", "DELIVERABLE", "REPORTING", "RENEWAL_NOTICE", "COMPLIANCE", "OTHER"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const obligationId = String(req.query.obligationId || "");
  const actor = { id: user.id, type: "USER" as const };

  try {
    assertUserCanDo(user, Permission.ContractsCreate);

    if (req.method === "POST") {
      const status = String(req.body?.status || "");
      if (!VALID.has(status)) return res.status(400).json({ ok: false, error: "Invalid obligation status" });
      const reason = typeof req.body?.reason === "string" ? req.body.reason : null;
      const updated = await updateObligationStatus(user.organizationId, obligationId, status as never, actor, { reason });
      return res.status(200).json({ ok: true, status: updated.status });
    }

    if (req.method === "PUT") {
      const b = req.body ?? {};
      const patch: Record<string, unknown> = {};
      if (typeof b.description === "string") patch.description = b.description;
      if (b.dueDate !== undefined) patch.dueDate = b.dueDate ? new Date(b.dueDate) : null;
      if (b.ownerId !== undefined) patch.ownerId = b.ownerId || null;
      if (typeof b.type === "string" && VALID_TYPES.has(b.type)) patch.type = b.type;
      if (b.recurrence !== undefined) patch.recurrence = b.recurrence || null;
      const updated = await updateObligationDetails(user.organizationId, obligationId, patch as never, actor);
      return res.status(200).json({ ok: true, id: updated.id });
    }

    if (req.method === "DELETE") {
      await deleteObligation(user.organizationId, obligationId, actor);
      return res.status(200).json({ ok: true, deleted: obligationId });
    }

    res.setHeader("Allow", "POST, PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof IllegalObligationTransitionError) return res.status(409).json({ ok: false, error: err.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
