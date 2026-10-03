/**
 * Admin ONE Legal skill item (SK-7).
 *   PUT    /api/admin/one-legal/skills/[id] — update one (partial).
 *   DELETE /api/admin/one-legal/skills/[id] — delete one.
 *
 * Gated `admin:agents:manage` via assertAndAudit. Update/delete are chain-sealed
 * in the store (`one_legal.skill.{updated,deleted}`). The id is resolved within
 * the caller's org only — a row from another org reads as not-found (404).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../../../lib/authz";
import {
  updateOrgSkill,
  deleteOrgSkill,
  SkillValidationError,
  SkillSlugConflictError,
  SkillNotFoundError,
} from "../../../../../lib/one-legal/skills-store";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ ok: false, error: "Missing skill id" });

  try {
    await assertAndAudit(user, Permission.AdminAgentsManage, { route: "admin.one-legal.skill", resourceType: "Skill", resourceId: id });
    const actor = { id: user.id, organizationId: user.organizationId };

    if (req.method === "PUT") {
      const row = await updateOrgSkill(actor, id, req.body || {});
      return res.status(200).json({ ok: true, skill: row });
    }

    if (req.method === "DELETE") {
      await deleteOrgSkill(actor, id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof SkillNotFoundError) return res.status(404).json({ ok: false, error: err.message });
    if (err instanceof SkillValidationError) return res.status(400).json({ ok: false, error: err.message, errors: err.errors });
    if (err instanceof SkillSlugConflictError) return res.status(409).json({ ok: false, error: err.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
