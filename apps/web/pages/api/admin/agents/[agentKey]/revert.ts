/**
 * POST /api/admin/agents/[agentKey]/revert  body: { toVersion }
 * Republishes a historical spec as a NEW version (append-only history).
 * Gated by `admin:agents:manage`; chain-sealed via the store.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { revertAgentDefinition } from "@aegis/intake/agent-designer";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const agentKey = String(req.query.agentKey || "");
  const toVersion = Number((req.body ?? {}).toVersion);
  if (!Number.isFinite(toVersion)) return res.status(400).json({ ok: false, error: "toVersion required" });
  try {
    const result = await revertAgentDefinition(actor.organizationId, agentKey, toVersion, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, version: result?.version ?? null });
  } catch (e) {
    return res.status(400).json({ ok: false, error: String((e as Error).message || e) });
  }
}
