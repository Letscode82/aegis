/**
 * POST /api/intake/tickets/[id]/rfi/[rfiId] — resolve an outstanding RFI.
 *   Body: { action: "answer", answer: string }  — the requester answers.
 *   Body: { action: "cancel" }                  — a reviewer cancels it.
 *
 * CW-5 — Cockpit RFI round-trip. The two transitions carry different gates:
 *   - "answer" is the requester's own action → `intake:read_own_tickets`,
 *     and the service enforces that the caller actually is the ticket's
 *     requester (self-scoped, not trust-the-client).
 *   - "cancel" is a reviewer action → `intake:read_all_tickets`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  answerRfi,
  cancelRfi,
  RfiTicketNotFoundError,
  RfiNotFoundError,
  RfiValidationError,
  RfiForbiddenError,
} from "@aegis/intake/rfi";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";
  const rfiId = typeof req.query.rfiId === "string" ? req.query.rfiId : "";
  if (!id || !rfiId) return res.status(400).json({ ok: false, error: "Missing ticket or RFI id" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "answer" && action !== "cancel") {
    return res.status(400).json({ ok: false, error: 'action must be "answer" or "cancel"' });
  }

  // Per-action gate: the requester answers their own ticket; a reviewer cancels.
  const permission =
    action === "answer" ? Permission.IntakeReadOwnTickets : Permission.IntakeReadAllTickets;
  const actor = await requireActor(req, res, permission);
  if (!actor) return;

  try {
    const rfi =
      action === "answer"
        ? await answerRfi(
            actor.organizationId,
            id,
            rfiId,
            { answer: typeof body.answer === "string" ? body.answer : "" },
            { req, res },
          )
        : await cancelRfi(actor.organizationId, id, rfiId, { req, res });
    return res.status(200).json({ ok: true, rfi });
  } catch (err) {
    if (err instanceof RfiTicketNotFoundError || err instanceof RfiNotFoundError)
      return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof RfiForbiddenError) return res.status(403).json({ ok: false, error: err.message });
    if (err instanceof RfiValidationError) return res.status(400).json({ ok: false, error: err.message });
    console.error("[/api/intake/tickets/[id]/rfi/[rfiId]] failed:", err);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
}
