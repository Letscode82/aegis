/**
 * POST /api/one-legal/act — execute a human-approved ONE Legal tool (OL-2).
 *
 * The console proposes a tool for a task; the human clicks Approve; this
 * route runs it. Governance lives in the universal gate
 * (`executeGovernedTool` in lib/one-legal/tools): a PENDING `AgentDecision` is
 * written before anything mutates, the tool's `Permission` is asserted, args
 * are re-derived server-side from the request text (never trusted from the
 * client), the module `api.ts` function executes (which chain-seals its own
 * audit), and the decision flips PENDING → APPROVED — linked to the resulting
 * `one_legal.tool.executed` audit row and the real resource. The streaming
 * `/run` route shares the same gate, so both surfaces behave identically.
 *
 * Body: { toolId: string, text: string, targetId?: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getTool, executeGovernedTool } from "../../../lib/one-legal/tools";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const body = (req.body || {}) as { toolId?: string; text?: string; targetId?: string };
    const toolId = String(body.toolId || "");
    const text = String(body.text || "").trim();
    const targetId = body.targetId ? String(body.targetId) : undefined;
    const tool = getTool(toolId);
    if (!tool) return res.status(400).json({ ok: false, error: `Unknown tool: ${toolId}` });
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Missing request text." });
    if (tool.needsTarget && !targetId) return res.status(400).json({ ok: false, error: `Select a ${tool.needsTarget.label.toLowerCase()} first.` });

    // The universal governed path: PENDING decision → permission gate → run →
    // APPROVED + chain-sealed audit. Args are re-derived server-side inside the
    // gate, so the client cannot smuggle its own.
    const result = await executeGovernedTool(tool, { text, targetId, user }, { route: "one-legal.act" });

    return res.status(200).json({
      ok: true,
      resourceId: result.resourceId,
      resourceLabel: result.resourceLabel,
      label: result.label,
      navigate: result.navigate,
      argsSummary: result.argsSummary,
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
