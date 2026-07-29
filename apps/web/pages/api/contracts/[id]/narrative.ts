/**
 * Contract change-narrative (CLM Phase 3b).
 *
 * GET  /api/contracts/[id]/narrative?from=&to=
 *   Read the current AI change-narrative for a version pair (or null).
 *   Gated on contracts:read_all.
 *
 * POST /api/contracts/[id]/narrative   body { fromVersion, toVersion }
 *   Generate (or refresh) the narrative. Writes a PENDING AgentDecision —
 *   the AI output is a recommendation, not fact; a human must approve it.
 *   Gated on contracts:read_all (generating an advisory rec is a read-grade
 *   action; the authoritative gate is the approve step, contracts:approve).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { generateChangeNarrative, getChangeNarrative } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);

    if (req.method === "GET") {
      const from = Number(req.query.from);
      const to = Number(req.query.to);
      if (!Number.isFinite(from) || !Number.isFinite(to))
        return res.status(400).json({ ok: false, error: "from and to versions are required" });
      const narrative = await getChangeNarrative(user.organizationId, contractId, from, to);
      return res.status(200).json({ ok: true, narrative });
    }

    if (req.method === "POST") {
      const fromVersion = Number(req.body?.fromVersion);
      const toVersion = Number(req.body?.toVersion);
      if (!Number.isFinite(fromVersion) || !Number.isFinite(toVersion))
        return res.status(400).json({ ok: false, error: "fromVersion and toVersion are required" });
      const narrative = await generateChangeNarrative(user.organizationId, contractId, fromVersion, toVersion, {
        id: user.id,
        type: "USER",
      });
      return res.status(200).json({ ok: true, narrative });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
