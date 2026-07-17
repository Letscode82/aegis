/**
 * GET /api/intake/contract-playbook — the org's contract playbook as prose,
 * for the intake contract agents to review against. Any authenticated user
 * (the agent runs in the requester's browser during triage); org-scoped.
 * Returns { playbookText } — empty string when no library is configured, so
 * the agent falls back to its built-in default. Reference legal positions
 * only — no per-contract data.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractPlaybookText } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const playbookText = await getContractPlaybookText(user.organizationId);
  return res.status(200).json({ ok: true, playbookText });
}
