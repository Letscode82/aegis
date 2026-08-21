/**
 * POST /api/review/sets/[id]/copilot — Case Copilot (CAP-1). Answers a case
 * question grounded in the collection's documents, with citations. GET returns
 * the Case Brief. Read-only. Legal-hold issue OR DSAR fulfill (or any read).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { answerCaseQuestion, buildCaseBrief } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldIssue, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  if (req.method === "GET") {
    try {
      const brief = await buildCaseBrief(actor.organizationId, id);
      return res.status(200).json({ ok: true, brief });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  if (req.method === "POST") {
    try {
      const b = req.body ?? {};
      const answer = await answerCaseQuestion(actor.organizationId, id, { question: b.question, history: Array.isArray(b.history) ? b.history : undefined }, { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, ...answer });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
