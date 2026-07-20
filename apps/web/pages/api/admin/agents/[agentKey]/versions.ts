/**
 * GET  /api/admin/agents/[agentKey]/versions          — list versions
 * GET  /api/admin/agents/[agentKey]/versions?version=N — one version's doc
 * Gated by `admin:agents:manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listAgentDefinitionVersions, getAgentDefinitionVersion } from "@aegis/intake/agent-designer";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agentKey = String(req.query.agentKey || "");
  const versionParam = req.query.version;

  if (versionParam != null) {
    const document = await getAgentDefinitionVersion(actor.organizationId, agentKey, Number(versionParam));
    if (!document) return res.status(404).json({ ok: false, error: "Version not found" });
    return res.status(200).json({ ok: true, document });
  }
  const versions = await listAgentDefinitionVersions(actor.organizationId, agentKey);
  return res.status(200).json({ ok: true, versions });
}
