/**
 * Structured contract playbooks (PR B) — list + create + ensure-default.
 *   GET  — list playbooks (with rule counts).
 *   POST — { action: "create" | "ensure-default", ...CreatePlaybookInput }.
 * All gated admin:contracts:playbooks_manage; mutations chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listPlaybooks, createPlaybook, ensureDefaultPlaybook } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const actor = { id: user.id, type: "USER" as const };

  try {
    assertUserCanDo(user, Permission.AdminContractsPlaybooksManage);
    if (req.method === "GET") {
      const playbooks = await listPlaybooks(user.organizationId);
      return res.status(200).json({ ok: true, playbooks });
    }
    if (req.method === "POST") {
      const b = req.body ?? {};
      if (b.action === "ensure-default") {
        const playbook = await ensureDefaultPlaybook(user.organizationId, actor);
        return res.status(200).json({ ok: true, playbook });
      }
      const playbook = await createPlaybook(user.organizationId, {
        name: String(b.name ?? ""),
        description: b.description ?? null,
        contractType: b.contractType ?? null,
        perspective: b.perspective ?? null,
        paperType: b.paperType ?? null,
      }, actor);
      return res.status(200).json({ ok: true, playbook });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
