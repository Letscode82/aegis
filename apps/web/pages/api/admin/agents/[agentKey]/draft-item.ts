/**
 * POST /api/admin/agents/[agentKey]/draft-item
 *   body: { instruction, packName?, kind? }
 * AI-drafts a single knowledge item (title + body) for the Designer's
 * Knowledge tab. Returns { title, body } — NOT persisted; the admin
 * reviews and saves. Gated by `admin:agents:manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { draftKnowledgeItem } from "@aegis/intake/agent-preview";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminAgentsManage);
  if (!actor) return;
  const body = (req.body ?? {}) as { instruction?: string; packName?: string; kind?: string };
  if (!body.instruction || !body.instruction.trim()) {
    return res.status(400).json({ ok: false, error: "instruction required" });
  }
  try {
    const item = await draftKnowledgeItem(body.instruction, { packName: body.packName || "knowledge", kind: body.kind || "RULE" });
    return res.status(200).json({ ok: true, ...item });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e as Error).message || e) });
  }
}
