/**
 * POST /api/admin/agents/[agentKey]/preview  body: { ticket }
 * Dry-runs the agent's CURRENT definition against a sample ticket and
 * returns the recommendation it WOULD produce — no persistence, no
 * AgentDecision. Lets the Designer show the effect of an edit before
 * publish. Gated by `admin:agents:manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { previewAgentDefinition } from "@aegis/intake/agent-preview";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agentKey = String(req.query.agentKey || "");
  const ticket = (req.body ?? {}).ticket ?? {};
  try {
    const result = await previewAgentDefinition(actor.organizationId, agentKey, ticket);
    if (!result) return res.status(404).json({ ok: false, error: "Unknown agent" });
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error).message || e) });
  }
}
