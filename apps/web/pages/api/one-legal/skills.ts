/**
 * GET /api/one-legal/skills — the console-facing skill catalog for the caller's
 * org: the built-in E1 catalog (skills.ts) with this org's authored rows folded
 * in (SK-7). Overrides replace a built-in in place, `enabled:false` hides one,
 * and net-new org skills append. The console renders the merged list exactly as
 * it renders the static catalog.
 *
 * Read-only and degrade-safe: if the Skill table read fails for any reason, we
 * fall back to the static catalog so the rail is never empty. Gated
 * `intake:create_ticket` — same as the other ONE Legal console routes.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assertAndAudit } from "../../../lib/authz";
import { getMergedSkills } from "../../../lib/one-legal/skills-store";
import { SKILLS } from "../../../lib/one-legal/skills";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    await assertAndAudit(user, Permission.IntakeCreateTicket, { route: "one-legal.skills" });
    const skills = await getMergedSkills(user.organizationId);
    return res.status(200).json({ ok: true, skills });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    // Degrade: never leave the console without a catalog.
    return res.status(200).json({ ok: true, skills: SKILLS.map((s) => ({ ...s, _source: "builtin" })), degraded: true });
  }
}
