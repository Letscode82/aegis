/**
 * POST /api/review/sets/[id]/accept-ai — one-click bulk-code: apply the AI's
 * tag decisions to every uncoded, AI-routed document. Human-initiated (the
 * coding gate is preserved); chain-sealed. Body: { onlyConfident?: boolean }.
 * Write grant.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { acceptAllAiCalls } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const onlyConfident = Boolean((req.body ?? {}).onlyConfident);
    const result = await acceptAllAiCalls(actor.organizationId, id, { id: actor.id, type: "USER" }, { onlyConfident });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
