/**
 * One structured playbook (PR B).
 *   GET — detail with rules.
 *   PUT — { action: "publish" | "archive" | "upsert-rule" | "delete-rule", ... }.
 * Gated admin:contracts:playbooks_manage; mutations chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getPlaybook, publishPlaybook, upsertPlaybookRule, deletePlaybookRule } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  const actor = { id: user.id, type: "USER" as const };

  try {
    assertUserCanDo(user, Permission.AdminContractsPlaybooksManage);
    if (req.method === "GET") {
      const playbook = await getPlaybook(user.organizationId, id);
      if (!playbook) return res.status(404).json({ ok: false, error: "Playbook not found" });
      return res.status(200).json({ ok: true, playbook });
    }
    if (req.method === "PUT") {
      const b = req.body ?? {};
      switch (b.action) {
        case "publish": {
          const playbook = await publishPlaybook(user.organizationId, id, actor, b.note);
          return res.status(200).json({ ok: true, playbook });
        }
        case "upsert-rule": {
          const rule = await upsertPlaybookRule(user.organizationId, id, b.rule ?? {}, actor);
          return res.status(200).json({ ok: true, rule });
        }
        case "delete-rule": {
          await deletePlaybookRule(user.organizationId, id, String(b.ruleId || ""), actor);
          return res.status(200).json({ ok: true });
        }
        default:
          return res.status(400).json({ ok: false, error: "Unknown action" });
      }
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
