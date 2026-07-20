/**
 * GET /api/intake/agent-def/[agentKey] — the published oKF document for one
 * agent, so the client-side runtime can run the DB-configured definition
 * (the live-fetch pattern the contract agents already use for the playbook).
 *
 * Any authenticated user (the agent runs in the requester's browser during
 * triage); org-scoped. Returns { ok, document } — the published document, or
 * the code-shipped static definition when the org hasn't got a published row
 * yet, so the browser demo never breaks. Reference config only, no per-ticket
 * data.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { getPublishedAgentDocument } from "@aegis/intake/agent-designer";
import { staticDefForKey } from "@aegis/intake/okf";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const agentKey = String(req.query.agentKey || "");
  if (!agentKey) return res.status(400).json({ ok: false, error: "agentKey required" });

  let document = null;
  try {
    document = await getPublishedAgentDocument(user.organizationId, agentKey);
  } catch {
    /* fall through to the static definition */
  }
  if (!document) document = staticDefForKey(agentKey);
  if (!document) return res.status(404).json({ ok: false, error: "Unknown agent" });

  return res.status(200).json({ ok: true, document });
}
