/**
 * GET /api/admin/agents/[agentKey]/export — the agent's current oKF
 * document as canonical JSON (the "open format" download). Gated by
 * `admin:agents:manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getAgentDocument } from "@aegis/intake/agent-designer";
import { serializeDocument } from "@aegis/intake/okf";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agentKey = String(req.query.agentKey || "");
  const document = await getAgentDocument(actor.organizationId, agentKey);
  if (!document) return res.status(404).json({ ok: false, error: "Unknown agent" });
  const json = serializeDocument(document);
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${agentKey}.okf.json"`);
  return res.status(200).send(json);
}
