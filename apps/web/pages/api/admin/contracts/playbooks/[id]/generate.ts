/**
 * Generate-from-precedent for a playbook (PR B) — human-gated.
 *   POST { action: "generate" }      — propose rules from executed contracts;
 *                                       writes one PENDING AgentDecision each.
 *   GET  ?pending=1                   — list generated-rule decisions.
 *   POST { action: "resolve", decisionId, verdict: "approve"|"reject", edited? }
 *                                       — approve (writes a live rule) or reject.
 * Gated admin:contracts:playbooks_manage; chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { generatePlaybookFromPrecedent, listGeneratedRuleDecisions, resolveGeneratedRule } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  const actor = { id: user.id, type: "USER" as const };

  try {
    assertUserCanDo(user, Permission.AdminContractsPlaybooksManage);
    if (req.method === "GET") {
      const decisions = await listGeneratedRuleDecisions(user.organizationId, id, { pendingOnly: req.query.pending === "1" });
      return res.status(200).json({ ok: true, decisions });
    }
    if (req.method === "POST") {
      const b = req.body ?? {};
      if (b.action === "resolve") {
        const verdict = b.verdict === "approve" ? "approve" : "reject";
        const decision = await resolveGeneratedRule(user.organizationId, String(b.decisionId || ""), verdict, actor, { edited: b.edited });
        return res.status(200).json({ ok: true, decision });
      }
      const decisions = await generatePlaybookFromPrecedent(user.organizationId, id, actor, { contractType: b.contractType ?? null });
      return res.status(200).json({ ok: true, decisions });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
