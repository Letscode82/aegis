/**
 * /api/review/sets/[id]/agent-actions — governed agentic actions (CAP-4).
 *   GET  — list proposals (PENDING/APPROVED/REJECTED AgentDecisions).
 *   POST — propose an action (writes a PENDING AgentDecision; nothing applied).
 * Propose needs a write grant; the human gate is the approve route.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listAgentProposals, proposeAgentAction } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterLegalHoldIssue, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
    if (!actor) return;
    const proposals = await listAgentProposals(actor.organizationId, id);
    return res.status(200).json({ ok: true, proposals });
  }
  if (req.method === "POST") {
    const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
    if (!actor) return;
    try {
      const b = req.body ?? {};
      const proposal = await proposeAgentAction(actor.organizationId, id, b.kind || "code-reviewer-responsive", { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, proposal });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
