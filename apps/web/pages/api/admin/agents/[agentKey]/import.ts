/**
 * POST /api/admin/agents/[agentKey]/import  body: { document }
 * Validates an uploaded oKF document and saves it as the draft (does NOT
 * auto-publish — the admin reviews, then publishes). Gated by
 * `admin:agents:manage`. Returns validation errors on a bad document.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { saveAgentDraft } from "@aegis/intake/agent-designer";
import { parseDocument } from "@aegis/intake/okf";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agentKey = String(req.query.agentKey || "");
  const raw = (req.body ?? {}).document;
  const parsed = parseDocument(raw);
  if (!parsed.ok || !parsed.document) {
    return res.status(400).json({ ok: false, error: "Invalid oKF document", errors: parsed.validation.errors });
  }
  if (parsed.document.agent.key !== agentKey) {
    return res.status(400).json({ ok: false, error: `Document is for "${parsed.document.agent.key}", not "${agentKey}"` });
  }
  await saveAgentDraft(actor.organizationId, agentKey, parsed.document);
  return res.status(200).json({ ok: true });
}
