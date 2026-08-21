/**
 * POST /api/review/agent-decisions/[decisionId] — approve or reject a proposed
 * agent action (CAP-4). Approve EXECUTES the mutation + chain-seals it; the AI
 * never applies on its own. Body: { action: "approve" | "reject" }. The approve
 * keystroke is the human gate. matter:legal_hold:issue OR privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { approveAgentAction, rejectAgentAction } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const decisionId = req.query.decisionId;
  if (typeof decisionId !== "string") return res.status(400).json({ error: "Invalid decisionId" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const action = (req.body ?? {}).action === "reject" ? "reject" : "approve";
    const proposal = action === "reject"
      ? await rejectAgentAction(actor.organizationId, decisionId, { id: actor.id, type: "USER" })
      : await approveAgentAction(actor.organizationId, decisionId, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, proposal });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
