/**
 * GET  /api/intake/tickets/[id]/handoff — current baton + pass history
 * POST /api/intake/tickets/[id]/handoff — perform a hand-off
 *   Body: { toHolder: "agent"|"human"|"queue", toUserId?, reason?,
 *           agentDecisionId?, syncAssignee? }
 *
 * Item 6 (agent ↔ human hand-off). Gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getHandoffState,
  handOff,
  HandoffTicketNotFoundError,
  HandoffValidationError,
} from "@aegis/intake/handoff";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;

  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ ok: false, error: "Missing ticket id" });

  try {
    if (req.method === "GET") {
      const state = await getHandoffState(actor.organizationId, id);
      return res.status(200).json({ ok: true, state });
    }
    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const state = await handOff(
        actor.organizationId,
        id,
        {
          toHolder: typeof body.toHolder === "string" ? body.toHolder : "",
          toUserId: typeof body.toUserId === "string" ? body.toUserId : null,
          reason: typeof body.reason === "string" ? body.reason : null,
          agentDecisionId:
            typeof body.agentDecisionId === "string" ? body.agentDecisionId : null,
          syncAssignee:
            typeof body.syncAssignee === "boolean" ? body.syncAssignee : undefined,
        },
        { req, res },
      );
      return res.status(200).json({ ok: true, state });
    }
  } catch (err) {
    if (err instanceof HandoffTicketNotFoundError) {
      return res.status(404).json({ ok: false, error: err.message });
    }
    if (err instanceof HandoffValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[/api/intake/tickets/[id]/handoff] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
