/**
 * Workflow engine — persistence shell around the pure ladder rules.
 *
 * Semantics (docs/workflow-engine-assessment.md):
 *   approve   → next non-skipped step; approving past the last step
 *               completes the workflow
 *   reject    → back to the first non-skipped step
 *   send_back → any previous step the actor selects
 *   cancel    → terminated
 *
 * Governance: every movement writes a WorkflowTransition row (product
 * surface) AND a chain-sealed AuditLog row via @aegis/db.logAudit
 * (compliance ledger), linked via resultingAuditLogId — the
 * twin-recording pattern from the Architectural Foundations. An
 * optimistic version lock rejects concurrent double-approvals.
 *
 * AGENT-kind steps: arriving at one inserts a PENDING
 * WorkflowAgentTask. This package does NOT run agents — the host
 * module's runner (W-B) executes the agent and applies the decision
 * back through actOnWorkflow, gated by the AgentDecision contract.
 */
import { prisma, logAudit } from "@aegis/db";
import {
  MAX_STEPS,
  computeRag,
  nextActionable,
  shouldSkip,
  type RagEntry,
  type StepShape,
} from "./rules";

export class WorkflowError extends Error {
  constructor(
    message: string,
    /** HTTP-ish status the host route can translate directly. */
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export class WorkflowVersionConflictError extends WorkflowError {
  constructor() {
    super("Workflow changed since you loaded it — refresh and retry", 409);
    this.name = "WorkflowVersionConflictError";
  }
}

export interface DefineWorkflowInput {
  organizationId: string;
  key: string;
  name: string;
  description?: string | null;
  steps: Array<{
    stepOrder: number;
    name: string;
    screenKey: string;
    approverRole?: string | null;
    kind?: "HUMAN" | "AGENT";
    agentConfigJson?: unknown;
    slaHours?: number | null;
    metadataJson?: unknown;
  }>;
}

export type WorkflowActionInput = "approve" | "reject" | "send_back" | "cancel";

type InstanceWithGraph = NonNullable<Awaited<ReturnType<typeof loadInstance>>>;

function loadInstance(instanceId: string) {
  return prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: {
      definition: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      transitions: { orderBy: { createdAt: "asc" } },
    },
  });
}

function stepShapes(instance: InstanceWithGraph): StepShape[] {
  return instance.definition.steps.map((s) => ({
    stepOrder: s.stepOrder,
    name: s.name,
    screenKey: s.screenKey,
    approverRole: s.approverRole,
    kind: s.kind,
    slaHours: s.slaHours,
    metadataJson: s.metadataJson,
  }));
}

function contextOf(instance: InstanceWithGraph): Record<string, unknown> {
  const ctx = instance.contextJson;
  return ctx && typeof ctx === "object" && !Array.isArray(ctx)
    ? (ctx as Record<string, unknown>)
    : {};
}

/**
 * Create or replace a ladder template (idempotent on (org, key)).
 * Replacing steps only affects future instances — running instances
 * keep their definition rows by id.
 */
export async function defineWorkflow(input: DefineWorkflowInput) {
  if (input.steps.length === 0) throw new WorkflowError("Definition needs at least one step");
  if (input.steps.length > MAX_STEPS)
    throw new WorkflowError(`A workflow definition may have at most ${MAX_STEPS} steps`);
  const orders = input.steps.map((s) => s.stepOrder).sort((a, b) => a - b);
  orders.forEach((o, i) => {
    if (o !== i + 1)
      throw new WorkflowError(`Step orders must be contiguous 1..${input.steps.length}`);
  });

  return prisma.$transaction(async (tx) => {
    const def = await tx.workflowDefinition.upsert({
      where: { organizationId_key: { organizationId: input.organizationId, key: input.key } },
      create: {
        organizationId: input.organizationId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
      },
      update: {
        name: input.name,
        description: input.description ?? null,
        isActive: true,
        version: { increment: 1 },
      },
    });
    await tx.workflowStep.deleteMany({ where: { definitionId: def.id } });
    await tx.workflowStep.createMany({
      data: input.steps.map((s) => ({
        definitionId: def.id,
        stepOrder: s.stepOrder,
        name: s.name,
        screenKey: s.screenKey,
        approverRole: s.approverRole ?? null,
        kind: s.kind ?? "HUMAN",
        agentConfigJson: (s.agentConfigJson ?? {}) as object,
        slaHours: s.slaHours ?? null,
        metadataJson: (s.metadataJson ?? {}) as object,
      })),
    });
    return tx.workflowDefinition.findUniqueOrThrow({
      where: { id: def.id },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });
  });
}

async function twinRecord(
  instance: { id: string; organizationId: string; entityType: string; entityId: string },
  transitionId: string,
  action: string,
  actor: string,
  detail: Record<string, unknown>,
) {
  const isAgent = actor.startsWith("agent:");
  const auditId = await logAudit({
    organizationId: instance.organizationId,
    actorId: isAgent ? null : actor,
    actorType: isAgent ? "AGENT" : "USER",
    action: `workflow.instance.${action}`,
    resourceType: "WorkflowInstance",
    resourceId: instance.id,
    afterJson: detail as never,
    metadata: {
      entityType: instance.entityType,
      entityId: instance.entityId,
      ...(isAgent ? { agentActor: actor } : {}),
    } as never,
  });
  if (auditId) {
    await prisma.workflowTransition.update({
      where: { id: transitionId },
      data: { resultingAuditLogId: auditId },
    });
  }
  return auditId;
}

async function maybeQueueAgentTask(instance: InstanceWithGraph, currentStepOrder: number) {
  if (instance.status !== "IN_PROGRESS") return;
  const step = instance.definition.steps.find((s) => s.stepOrder === currentStepOrder);
  if (!step || step.kind !== "AGENT") return;
  const open = await prisma.workflowAgentTask.findFirst({
    where: {
      instanceId: instance.id,
      stepOrder: step.stepOrder,
      status: { in: ["PENDING", "RUNNING", "ESCALATED"] },
    },
    select: { id: true },
  });
  if (open) return;
  await prisma.workflowAgentTask.create({
    data: {
      instanceId: instance.id,
      stepOrder: step.stepOrder,
      inputJson: { agentConfig: step.agentConfigJson, context: instance.contextJson } as object,
    },
  });
}

export async function startWorkflow(input: {
  organizationId: string;
  definitionKey: string;
  entityType: string;
  entityId: string;
  startedById: string;
  context?: Record<string, unknown>;
}) {
  const def = await prisma.workflowDefinition.findUnique({
    where: {
      organizationId_key: { organizationId: input.organizationId, key: input.definitionKey },
    },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!def || !def.isActive)
    throw new WorkflowError(`No active workflow definition '${input.definitionKey}'`, 404);
  if (def.steps.length === 0) throw new WorkflowError("Definition has no steps");

  const context = input.context ?? {};
  const shapes: StepShape[] = def.steps.map((s) => ({
    stepOrder: s.stepOrder,
    name: s.name,
    screenKey: s.screenKey,
    kind: s.kind,
    slaHours: s.slaHours,
    metadataJson: s.metadataJson,
  }));
  const first = nextActionable(shapes, 0, context);
  if (first === null)
    throw new WorkflowError("All steps are skipped by conditions; nothing to run");

  const instance = await prisma.workflowInstance.create({
    data: {
      organizationId: input.organizationId,
      definitionId: def.id,
      entityType: input.entityType,
      entityId: input.entityId,
      startedById: input.startedById,
      contextJson: context as object,
      currentStepOrder: first,
    },
  });
  const transition = await prisma.workflowTransition.create({
    data: {
      instanceId: instance.id,
      fromStepOrder: 0,
      toStepOrder: first,
      action: "START",
      actor: input.startedById,
    },
  });
  await twinRecord(instance, transition.id, "started", input.startedById, {
    definitionKey: def.key,
    firstStep: first,
  });
  const loaded = await loadInstance(instance.id);
  if (loaded) await maybeQueueAgentTask(loaded, first);
  return instance;
}

export async function actOnWorkflow(input: {
  instanceId: string;
  action: WorkflowActionInput;
  actor: string;
  comment?: string | null;
  targetStep?: number | null;
  expectedVersion?: number | null;
}) {
  const instance = await loadInstance(input.instanceId);
  if (!instance) throw new WorkflowError("Workflow instance not found", 404);
  if (instance.status !== "IN_PROGRESS")
    throw new WorkflowError(`Workflow is already ${instance.status.toLowerCase()}`, 409);

  const context = contextOf(instance);
  const steps = stepShapes(instance);
  const current = instance.currentStepOrder;

  let toStep: number | null;
  let newStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" = "IN_PROGRESS";

  if (input.action === "approve") {
    toStep = nextActionable(steps, current, context);
    if (toStep === null) newStatus = "COMPLETED";
  } else if (input.action === "reject") {
    toStep = nextActionable(steps, 0, context) ?? 1;
  } else if (input.action === "send_back") {
    if (input.targetStep == null) throw new WorkflowError("send_back requires targetStep");
    if (!(input.targetStep >= 1 && input.targetStep < current))
      throw new WorkflowError(`targetStep must be a previous step (1..${current - 1})`);
    toStep = input.targetStep;
  } else if (input.action === "cancel") {
    toStep = null;
    newStatus = "CANCELLED";
  } else {
    throw new WorkflowError(`Unknown action '${input.action as string}'`);
  }

  // Optimistic lock: the UPDATE only lands if the version still matches.
  const expected = input.expectedVersion ?? instance.version;
  const { count } = await prisma.workflowInstance.updateMany({
    where: { id: instance.id, version: expected, status: "IN_PROGRESS" },
    data: {
      version: { increment: 1 },
      status: newStatus,
      ...(toStep !== null ? { currentStepOrder: toStep, stepEnteredAt: new Date() } : {}),
    },
  });
  if (count === 0) throw new WorkflowVersionConflictError();

  const transition = await prisma.workflowTransition.create({
    data: {
      instanceId: instance.id,
      fromStepOrder: current,
      toStepOrder: newStatus === "IN_PROGRESS" ? toStep : null,
      action: input.action.toUpperCase() as "APPROVE" | "REJECT" | "SEND_BACK" | "CANCEL",
      actor: input.actor,
      comment: input.comment ?? null,
    },
  });
  await twinRecord(instance, transition.id, `${input.action}d`.replace("send_backd", "sent_back"), input.actor, {
    fromStep: current,
    toStep,
    status: newStatus,
    comment: input.comment ?? null,
  });

  const after = await loadInstance(instance.id);
  if (after && toStep !== null && newStatus === "IN_PROGRESS")
    await maybeQueueAgentTask(after, toStep);
  return after!;
}

export async function getWorkflowInstance(instanceId: string): Promise<
  | (InstanceWithGraph & { rag: RagEntry[] })
  | null
> {
  const instance = await loadInstance(instanceId);
  if (!instance) return null;
  return { ...instance, rag: ragFor(instance) };
}

export function ragFor(instance: InstanceWithGraph, now?: Date): RagEntry[] {
  return computeRag({
    steps: stepShapes(instance),
    transitions: instance.transitions.map((t) => ({
      fromStepOrder: t.fromStepOrder,
      toStepOrder: t.toStepOrder,
      action: t.action,
    })),
    currentStepOrder: instance.currentStepOrder,
    status: instance.status,
    context: contextOf(instance),
    stepEnteredAt: instance.stepEnteredAt,
    now,
  });
}

export async function listWorkflowDefinitions(
  organizationId: string,
  opts: { includeInactive?: boolean } = {},
) {
  return prisma.workflowDefinition.findMany({
    where: { organizationId, ...(opts.includeInactive ? {} : { isActive: true }) },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
}

export async function listInstancesForEntity(
  organizationId: string,
  entityType: string,
  entityId: string,
) {
  return prisma.workflowInstance.findMany({
    where: { organizationId, entityType, entityId },
    include: {
      definition: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      transitions: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export { shouldSkip };
