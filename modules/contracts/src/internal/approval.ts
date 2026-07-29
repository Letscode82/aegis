/**
 * Contract approval — the live governance ladder (CTR-8).
 *
 * The Contracts workspace used to only *name* the "Contract Approval ladder"
 * in prose and ask the user to approve it somewhere else. This service wires
 * it for real, driving the shared `@aegis/workflow` engine instead of
 * inventing a contract-local approval table (the "one brain" rule):
 *
 *   - submitContractForApproval() starts the seeded `clm_contract_approval`
 *     ladder against entityType="Contract", auto-completes its opening
 *     "Draft & Submit" human step (submitting the wizard *is* that step),
 *     and moves the contract DRAFT/IN_NEGOTIATION → IN_REVIEW.
 *   - getContractApprovalState() maps the live WorkflowInstance onto step
 *     DTOs the workspace panel renders.
 *   - actOnContractApproval() wraps actOnWorkflow (approve / send_back /
 *     reject). When the final approve completes the ladder, the contract is
 *     auto-advanced IN_REVIEW → APPROVED — that transition is the gate.
 *
 * Every mutation is chain-sealed: the workflow engine twin-records each
 * transition to AuditLog, and this service writes contract.approval.* rows
 * on top. Conservative-AI governance is preserved — the AI Risk Review step
 * produces advisory findings but a human reviewer still approves to advance;
 * no ladder step can be skipped by an AI actor.
 */
import { prisma, logAudit } from "@aegis/db";
import {
  startWorkflow,
  actOnWorkflow,
  listInstancesForEntity,
  ragFor,
  type WorkflowActionInput,
} from "@aegis/workflow";
import { transitionContractStatus } from "./service";

const DEFINITION_KEY = "clm_contract_approval";
const ENTITY_TYPE = "Contract";
const SUBMITTABLE = new Set(["DRAFT", "IN_NEGOTIATION"]);

export type ContractApprovalActor = { id: string; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ApprovalStepDTO {
  stepOrder: number;
  name: string;
  kind: "HUMAN" | "AGENT";
  approverRole: string | null;
  slaHours: number | null;
  state: "done" | "current" | "upcoming";
  rag: "GREEN" | "AMBER" | "RED" | null;
}

export interface ContractApprovalStateDTO {
  contractId: string;
  contractStatus: string;
  hasLadder: boolean;
  instanceId: string | null;
  ladderStatus: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | null;
  currentStepOrder: number | null;
  currentStep: ApprovalStepDTO | null;
  steps: ApprovalStepDTO[];
  canSubmit: boolean;
  startedAt: string | null;
}

async function loadContract(organizationId: string, contractId: string) {
  const contract = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!contract) throw new Error("Contract not found");
  return contract;
}

// Best-effort RAG per step order from the shared engine helper. The engine
// owns the InstanceWithGraph shape; we tolerate any drift rather than crash
// the read.
function ragByStep(instance: unknown): Record<number, "GREEN" | "AMBER" | "RED"> {
  const out: Record<number, "GREEN" | "AMBER" | "RED"> = {};
  try {
    for (const entry of ragFor(instance as never) || []) {
      const e = entry as { stepOrder?: number; rag?: "GREEN" | "AMBER" | "RED" };
      if (typeof e.stepOrder === "number" && e.rag) out[e.stepOrder] = e.rag;
    }
  } catch {
    /* RAG is decorative; never let it break the read */
  }
  return out;
}

export function mapSteps(instance: {
  status: string;
  currentStepOrder: number;
  definition: { steps: Array<{ stepOrder: number; name: string; kind: string; approverRole: string | null; slaHours: number | null }> };
}): ApprovalStepDTO[] {
  const completed = instance.status === "COMPLETED";
  const rags = ragByStep(instance);
  return [...instance.definition.steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((s) => {
      const state: ApprovalStepDTO["state"] = completed || s.stepOrder < instance.currentStepOrder
        ? "done"
        : s.stepOrder === instance.currentStepOrder
          ? "current"
          : "upcoming";
      return {
        stepOrder: s.stepOrder,
        name: s.name,
        kind: (s.kind === "AGENT" ? "AGENT" : "HUMAN"),
        approverRole: s.approverRole,
        slaHours: s.slaHours,
        state,
        rag: state === "current" ? rags[s.stepOrder] ?? null : null,
      };
    });
}

export async function getContractApprovalState(
  organizationId: string,
  contractId: string,
): Promise<ContractApprovalStateDTO> {
  const contract = await loadContract(organizationId, contractId);
  const instances = await listInstancesForEntity(organizationId, ENTITY_TYPE, contractId);
  const inProgress = instances.some((i) => i.status === "IN_PROGRESS");
  // Prefer the running ladder; otherwise show the most recent (desc order).
  const active = instances.find((i) => i.status === "IN_PROGRESS") ?? instances[0] ?? null;

  const canSubmit = SUBMITTABLE.has(contract.status) && !inProgress;

  if (!active) {
    return {
      contractId,
      contractStatus: contract.status,
      hasLadder: false,
      instanceId: null,
      ladderStatus: null,
      currentStepOrder: null,
      currentStep: null,
      steps: [],
      canSubmit,
      startedAt: null,
    };
  }

  const steps = mapSteps(active as never);
  return {
    contractId,
    contractStatus: contract.status,
    hasLadder: true,
    instanceId: active.id,
    ladderStatus: active.status as ContractApprovalStateDTO["ladderStatus"],
    currentStepOrder: active.status === "IN_PROGRESS" ? active.currentStepOrder : null,
    currentStep: steps.find((s) => s.state === "current") ?? null,
    steps,
    canSubmit,
    startedAt: active.createdAt ? new Date(active.createdAt).toISOString() : null,
  };
}

export async function submitContractForApproval(
  organizationId: string,
  contractId: string,
  actor: ContractApprovalActor,
): Promise<ContractApprovalStateDTO> {
  const contract = await loadContract(organizationId, contractId);
  if (!SUBMITTABLE.has(contract.status)) {
    throw new Error(`Cannot submit a ${contract.status} contract for approval — only DRAFT or IN_NEGOTIATION contracts can enter the ladder.`);
  }
  const existing = await listInstancesForEntity(organizationId, ENTITY_TYPE, contractId);
  if (existing.some((i) => i.status === "IN_PROGRESS")) {
    throw new Error("An approval ladder is already running for this contract.");
  }

  const instance = await startWorkflow({
    organizationId,
    definitionKey: DEFINITION_KEY,
    entityType: ENTITY_TYPE,
    entityId: contractId,
    startedById: actor.id,
    context: {
      contract_id: contractId,
      contract_value: Number(contract.value ?? 0),
      title: contract.title,
    },
  });

  // Submitting the wizard *is* the opening "Draft & Submit" human step —
  // complete it on the submitter's behalf so the ladder lands on AI Risk
  // Review. Tolerant: if the first step isn't human-approvable, leave it.
  try {
    await actOnWorkflow({
      instanceId: instance.id,
      action: "approve",
      actor: actor.id,
      comment: "Submitted via guided approval wizard",
    });
  } catch {
    /* first step stays current; the panel can advance it */
  }

  await transitionContractStatus(organizationId, contractId, "IN_REVIEW" as never, {
    id: actor.id,
    type: "USER",
  });

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "contract.approval.submitted",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { instanceId: instance.id, definitionKey: DEFINITION_KEY } as never,
    metadata: { source: "guided-wizard" },
  });

  return getContractApprovalState(organizationId, contractId);
}

export async function actOnContractApproval(
  organizationId: string,
  contractId: string,
  action: WorkflowActionInput,
  actor: ContractApprovalActor,
  comment?: string | null,
): Promise<ContractApprovalStateDTO> {
  const instances = await listInstancesForEntity(organizationId, ENTITY_TYPE, contractId);
  const active = instances.find((i) => i.status === "IN_PROGRESS");
  if (!active) throw new Error("No running approval ladder for this contract.");

  const result = (await actOnWorkflow({
    instanceId: active.id,
    action,
    actor: actor.id,
    comment: comment ?? null,
  })) as { status: string };

  if (action === "approve" && result.status === "COMPLETED") {
    // The gate: the ladder is complete, so — and only so — the contract
    // crosses IN_REVIEW → APPROVED.
    const contract = await loadContract(organizationId, contractId);
    if (contract.status === "IN_REVIEW") {
      await transitionContractStatus(organizationId, contractId, "APPROVED" as never, {
        id: actor.id,
        type: "USER",
      });
    }
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "contract.approval.completed",
      resourceType: "Contract",
      resourceId: contractId,
      afterJson: { instanceId: active.id } as never,
      metadata: { source: "approval-ladder" },
    });
  } else if (action === "reject") {
    // Rejection cancels the ladder; reopen the contract for changes.
    const contract = await loadContract(organizationId, contractId);
    if (contract.status === "IN_REVIEW") {
      await transitionContractStatus(organizationId, contractId, "IN_NEGOTIATION" as never, {
        id: actor.id,
        type: "USER",
      });
    }
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "contract.approval.rejected",
      resourceType: "Contract",
      resourceId: contractId,
      afterJson: { instanceId: active.id, comment: comment ?? null } as never,
      metadata: { source: "approval-ladder" },
    });
  } else {
    await logAudit({
      organizationId,
      actorId: actor.id,
      actorType: "USER",
      action: "contract.approval.acted",
      resourceType: "Contract",
      resourceId: contractId,
      afterJson: { instanceId: active.id, action } as never,
      metadata: { source: "approval-ladder" },
    });
  }

  return getContractApprovalState(organizationId, contractId);
}
