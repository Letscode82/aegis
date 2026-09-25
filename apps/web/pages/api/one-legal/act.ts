/**
 * POST /api/one-legal/act — execute a human-approved ONE Legal tool (OL-2).
 *
 * The console proposes a tool for a task; the human clicks Approve; this
 * route runs it. Governance: the tool's `Permission` is asserted, args are
 * re-derived server-side from the request text (never trusted from the
 * client), the module `api.ts` function executes (which chain-seals its own
 * audit), and we write an `AgentDecision` row — approved by this user —
 * plus a `one_legal.tool.executed` audit row as the evidence record.
 *
 * Body: { toolId: string, text: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma, logAudit } from "@aegis/db";
import { getTool } from "../../../lib/one-legal/tools";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const body = (req.body || {}) as { toolId?: string; text?: string };
    const toolId = String(body.toolId || "");
    const text = String(body.text || "").trim();
    const tool = getTool(toolId);
    if (!tool) return res.status(400).json({ ok: false, error: `Unknown tool: ${toolId}` });
    if (text.length < 3) return res.status(400).json({ ok: false, error: "Missing request text." });

    // Permission gate for this specific action.
    assertUserCanDo(user, tool.permission);

    // Args are derived server-side — the client cannot smuggle its own.
    const args = tool.deriveArgs(text);
    const result = await tool.run(args, { id: user.id, organizationId: user.organizationId });

    // Evidence record: a human-approved AgentDecision governing this action,
    // plus a chain-sealed audit row (the module's api.ts also audits its own
    // mutation; this records the ONE Legal approval that authorized it).
    let auditLogId: string | null = null;
    try {
      auditLogId = await logAudit({
        organizationId: user.organizationId,
        actorId: user.id,
        actorType: "USER",
        action: "one_legal.tool.executed",
        resourceType: tool.resourceType,
        resourceId: result.resourceId,
        afterJson: { toolId, args, label: result.label } as never,
        metadata: { source: "one-legal" } as never,
      });
    } catch { /* audit is best-effort; never blocks the action */ }

    try {
      await prisma.agentDecision.create({
        data: {
          organizationId: user.organizationId,
          agentName: "one-legal",
          modelId: "one-legal",
          modelVersion: "1",
          promptHash: createHash("sha256").update(text).digest("hex"),
          recommendationJson: { toolId, args, label: result.label } as never,
          confidence: null,
          approvalStatus: "APPROVED",
          approvedById: user.id,
          approvedAt: new Date(),
          resultingAuditLogId: auditLogId,
          resourceType: tool.resourceType,
          resourceId: result.resourceId,
        },
      });
    } catch { /* decision row is evidence; a write failure must not undo the action */ }

    return res.status(200).json({
      ok: true,
      resourceId: result.resourceId,
      resourceLabel: result.resourceLabel,
      label: result.label,
      navigate: result.navigate,
      argsSummary: tool.summary(args),
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
