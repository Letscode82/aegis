/**
 * GET /api/intake/conflict-check?personId=… | ?counterpartyId=…
 *
 * W3-4 — one-brain conflict check: every intake ticket and matter
 * involving the entity, off the shared Person / Counterparty rows.
 * Each run writes a chain-sealed `intake.conflict_check.run` audit row
 * (who looked, when, what they found). Staff surface — gated
 * intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  runConflictCheck,
  ConflictEntityNotFoundError,
} from "@aegis/intake/conflict";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;

  const personId =
    typeof req.query.personId === "string" ? req.query.personId : null;
  const counterpartyId =
    typeof req.query.counterpartyId === "string" ? req.query.counterpartyId : null;
  if (!personId && !counterpartyId) {
    return res
      .status(400)
      .json({ ok: false, error: "Pass personId or counterpartyId" });
  }

  try {
    const result = await runConflictCheck(
      actor.organizationId,
      { personId, counterpartyId },
      { req, res },
    );
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ConflictEntityNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/conflict-check] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
