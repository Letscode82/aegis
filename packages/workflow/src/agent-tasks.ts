/**
 * Agent-task lifecycle for AGENT-kind ladder steps.
 *
 * CONSERVATIVE-GOVERNANCE ADAPTATION (deliberate departure from the
 * assessed Python engine): the original auto-applied an agent's
 * decision above min_confidence. AEGIS's non-negotiable #7 says every
 * AI action that mutates state requires human approval — so here the
 * agent NEVER advances the ladder. Running a task stores the agent's
 * findings on the task row (DONE when confidence clears the step's
 * minConfidence bar, ESCALATED when it doesn't); the step stays with
 * its human approverRole either way, who acts through actOnWorkflow
 * informed by the findings. The engine's agent-actor transition
 * support (actor "agent:<key>") stays reserved for a future
 * AgentDecision-gated auto-apply, where the human approval itself
 * executes the movement.
 *
 * Execution is dependency-injected: this package cannot (and must
 * not) import module agents — the composition root (apps/web) passes
 * a handler that resolves the step's agentKey against the host's
 * registry.
 */
import { prisma, logAudit } from "@aegis/db";
import { WorkflowError } from "./engine";

export const DEFAULT_MIN_CONFIDENCE = 0.8;

export interface AgentTaskInput {
  /** From the step's agentConfigJson: {"agentKey","minConfidence"}. */
  agentConfig: { agentKey?: string; minConfidence?: number } & Record<string, unknown>;
  /** The instance's contextJson at queue time. */
  context: Record<string, unknown>;
}

export interface AgentTaskFindings {
  /** 0..1 — compared against the step's minConfidence. */
  confidence: number;
  /** What the agent recommends the human approver do. */
  suggestedAction: string;
  /** One-paragraph findings shown beside the step. */
  summary: string;
  /** Optional extra payload (draft, concerns, …). */
  detail?: Record<string, unknown>;
}

export type AgentTaskHandler = (input: AgentTaskInput) => Promise<AgentTaskFindings>;

export async function listAgentTasks(
  organizationId: string,
  status?: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "ESCALATED",
) {
  return prisma.workflowAgentTask.findMany({
    where: { instance: { organizationId }, ...(status ? { status } : {}) },
    include: { instance: { select: { id: true, entityType: true, entityId: true, currentStepOrder: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Claim and execute one PENDING task with the injected handler.
 * Outcome: DONE (findings stored, confidence ≥ bar) or ESCALATED
 * (findings stored, confidence below bar — the human role must look)
 * or FAILED (handler threw). Never moves the ladder.
 */
export async function runAgentTask(taskId: string, handler: AgentTaskHandler) {
  // Claim: PENDING → RUNNING (single winner under concurrency).
  const { count } = await prisma.workflowAgentTask.updateMany({
    where: { id: taskId, status: "PENDING" },
    data: { status: "RUNNING" },
  });
  if (count === 0) throw new WorkflowError("Agent task is not pending", 409);

  const task = await prisma.workflowAgentTask.findUniqueOrThrow({
    where: { id: taskId },
    include: { instance: true },
  });
  const input = (task.inputJson ?? {}) as unknown as AgentTaskInput;
  const minConfidence =
    typeof input.agentConfig?.minConfidence === "number"
      ? input.agentConfig.minConfidence
      : DEFAULT_MIN_CONFIDENCE;

  let status: "DONE" | "FAILED" | "ESCALATED";
  let output: Record<string, unknown>;
  try {
    const findings = await handler(input);
    status = findings.confidence >= minConfidence ? "DONE" : "ESCALATED";
    output = { ...findings, minConfidence };
  } catch (err) {
    status = "FAILED";
    output = { error: String(err).slice(0, 500), minConfidence };
  }

  const updated = await prisma.workflowAgentTask.update({
    where: { id: taskId },
    data: { status, outputJson: output as object, finishedAt: new Date() },
  });

  await logAudit({
    organizationId: task.instance.organizationId,
    actorId: null,
    actorType: "AGENT",
    action: `workflow.agent_task.${status.toLowerCase()}`,
    resourceType: "WorkflowAgentTask",
    resourceId: taskId,
    afterJson: {
      instanceId: task.instanceId,
      stepOrder: task.stepOrder,
      agentKey: input.agentConfig?.agentKey ?? null,
      confidence: (output.confidence as number | undefined) ?? null,
      suggestedAction: (output.suggestedAction as string | undefined) ?? null,
    } as never,
    metadata: { minConfidence } as never,
  });

  return updated;
}
