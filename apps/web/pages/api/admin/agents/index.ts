/**
 * GET /api/admin/agents — list every agent definition for the org (Agent
 * Designer landing). Gated by `admin:agents:manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listAgentDefinitions } from "@aegis/intake/agent-designer";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agents = await listAgentDefinitions(actor.organizationId);
  return res.status(200).json({ ok: true, agents });
}
