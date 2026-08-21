/**
 * /api/review/sets/[id]/knowledge-graph — the Case Knowledge Graph (CAP-3).
 *   GET  — the stored nodes + edges.
 *   POST — (re)materialize the graph from the collection's documents.
 * Read-only over the collection. Legal-hold issue OR DSAR fulfill (or any read).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getCaseKnowledgeGraph, materializeCaseGraph } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldIssue, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    if (req.method === "GET") {
      const graph = await getCaseKnowledgeGraph(actor.organizationId, id);
      return res.status(200).json({ ok: true, graph });
    }
    if (req.method === "POST") {
      const graph = await materializeCaseGraph(actor.organizationId, id, { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, graph });
    }
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
