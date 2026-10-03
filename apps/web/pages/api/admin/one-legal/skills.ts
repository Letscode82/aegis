/**
 * Admin ONE Legal skills collection (SK-7).
 *   GET  /api/admin/one-legal/skills — list this org's authored skill rows.
 *   POST /api/admin/one-legal/skills — create one.
 *
 * Gated `admin:agents:manage` via assertAndAudit (same permission that governs
 * the Agent Designer / oKF surface — authoring the console's playbook entry
 * points is the same class of privilege). Every create is chain-sealed in the
 * store (`one_legal.skill.created`).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../../lib/authz";
import {
  listOrgSkills,
  createOrgSkill,
  SkillValidationError,
  SkillSlugConflictError,
} from "../../../../lib/one-legal/skills-store";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.AdminAgentsManage, { route: "admin.one-legal.skills" });

    if (req.method === "GET") {
      const skills = await listOrgSkills(user.organizationId);
      return res.status(200).json({ ok: true, skills });
    }

    if (req.method === "POST") {
      const row = await createOrgSkill({ id: user.id, organizationId: user.organizationId }, req.body || {});
      return res.status(201).json({ ok: true, skill: row });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof SkillValidationError) return res.status(400).json({ ok: false, error: err.message, errors: err.errors });
    if (err instanceof SkillSlugConflictError) return res.status(409).json({ ok: false, error: err.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
