/**
 * POST /api/one-legal/agent — run the ONE Legal research agent loop (A1).
 *
 * Multi-step, read-only reasoning over the org's documents: the loop plans,
 * searches/reads, observes, and iterates before answering with citations. See
 * lib/one-legal/agent-loop.ts for the governance note — the loop cannot mutate
 * anything; writes stay on the human-approval path.
 *
 * Server-side only; gated intake:create_ticket (same as the other console routes).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { runAgentLoop } from "../../../lib/one-legal/agent-loop";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    assertUserCanDo(user, Permission.IntakeCreateTicket);
    const question = String((req.body || {}).text || "").trim();
    if (question.length < 3) return res.status(400).json({ ok: false, error: "Ask a question in a few words." });

    const result = await runAgentLoop({ organizationId: user.organizationId, question });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
