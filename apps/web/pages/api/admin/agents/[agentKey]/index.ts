/**
 * Agent Designer — one agent's definition.
 *   GET  → { document, versions }  (the current editable oKF doc + history)
 *   PUT  → save draft   body: { document }
 *   POST → publish      body: { changeLog? }   (new immutable version, live)
 *
 * Gated by `admin:agents:manage`. Publish is chain-sealed via logAudit in
 * the store. Nothing here touches the AgentDecision gate — this configures
 * WHAT the agent does, never whether a human signs off.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getAgentDocument,
  saveAgentDraft,
  publishAgentDefinition,
  listAgentDefinitionVersions,
} from "@aegis/intake/agent-designer";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agentKey = String(req.query.agentKey || "");
  if (!agentKey) return res.status(400).json({ ok: false, error: "agentKey required" });

  if (req.method === "GET") {
    const document = await getAgentDocument(actor.organizationId, agentKey);
    if (!document) return res.status(404).json({ ok: false, error: "Unknown agent" });
    const versions = await listAgentDefinitionVersions(actor.organizationId, agentKey);
    return res.status(200).json({ ok: true, document, versions });
  }

  if (req.method === "PUT") {
    const document = (req.body ?? {}).document;
    if (!document) return res.status(400).json({ ok: false, error: "document required" });
    try {
      await saveAgentDraft(actor.organizationId, agentKey, document);
    } catch (e) {
      return res.status(400).json({ ok: false, error: String((e as Error).message || e) });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
    const changeLog = (req.body ?? {}).changeLog ?? null;
    const result = await publishAgentDefinition(actor.organizationId, agentKey, changeLog, { id: actor.id, type: "USER" });
    if (!result) return res.status(200).json({ ok: true, published: false, reason: "No changes to publish" });
    return res.status(200).json({ ok: true, published: true, version: result.version });
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
