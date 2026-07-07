/**
 * POST /api/workflows/agent-tasks/[id]/run — execute a pending
 * AGENT-step task with the intake agent registry.
 *
 * Composition-root wiring: apps/web (allowed to import modules)
 * resolves the step's agentKey against @aegis/intake's registry and
 * hands @aegis/workflow.runAgentTask a handler. Conservative
 * governance holds — the run stores FINDINGS on the task (DONE or
 * ESCALATED below the step's minConfidence); it never advances the
 * ladder. The human approver acts on the step informed by them.
 *
 * Gate: mirrors the act route — the current step's approverRole (or
 * platform admin) may trigger a run.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { prisma } from "@aegis/db";
import { runAgentTask, WorkflowError, type AgentTaskInput } from "@aegis/workflow";
import { AGENTS_BY_ID } from "@aegis/intake/agents";

interface IntakeAgent {
  id: string;
  process(ticket: Record<string, unknown>): Promise<{
    confidence?: number;
    suggestedAction?: string;
    reasoning?: string;
    draftedResponse?: string;
    concerns?: string[];
  }>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const task = await prisma.workflowAgentTask.findUnique({
    where: { id: String(req.query.id) },
    include: {
      instance: {
        include: { definition: { include: { steps: true } } },
      },
    },
  });
  if (!task || task.instance.organizationId !== user.organizationId)
    return res.status(404).json({ ok: false, error: "Agent task not found" });

  const step = task.instance.definition.steps.find((s) => s.stepOrder === task.stepOrder);
  if (step?.approverRole && user.roleName !== "admin" && user.roleName !== step.approverRole)
    return res.status(403).json({
      ok: false,
      error: `This step is assigned to the '${step.approverRole}' role`,
    });

  try {
    const updated = await runAgentTask(task.id, async (input: AgentTaskInput) => {
      const agentKey = input.agentConfig?.agentKey;
      const agent = agentKey
        ? ((AGENTS_BY_ID as Record<string, IntakeAgent>)[agentKey] ?? null)
        : null;
      if (!agent) throw new Error(`No registered agent '${agentKey ?? "(unset)"}'`);
      const ticket = (input.context?.ticket ?? input.context ?? {}) as Record<string, unknown>;
      const rec = await agent.process(ticket);
      return {
        confidence: typeof rec.confidence === "number" ? rec.confidence : 0,
        suggestedAction: rec.suggestedAction ?? "flag-for-review",
        summary: rec.reasoning ?? "",
        detail: {
          draftedResponse: rec.draftedResponse ?? null,
          concerns: rec.concerns ?? [],
        },
      };
    });
    return res.status(200).json({ ok: true, task: updated });
  } catch (err) {
    if (err instanceof WorkflowError)
      return res.status(err.status).json({ ok: false, error: err.message });
    throw err;
  }
}
