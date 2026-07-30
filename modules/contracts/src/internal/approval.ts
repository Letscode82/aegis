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
  autoRunCurrentAgentStep,
  listInstancesForEntity,
  listAgentTasksForInstance,
  ragFor,
  type WorkflowActionInput,
  type AgentTaskInput,
  type AgentTaskFindings,
} from "@aegis/workflow";
import { transitionContractStatus } from "./service";
import { scoreContractClauses, type RiskLevel, type ClauseRiskScore } from "./risk-score";

const DEFINITION_KEY = "clm_contract_approval";
const ENTITY_TYPE = "Contract";
const SUBMITTABLE = new Set(["DRAFT", "IN_NEGOTIATION"]);

// ── AI Risk Review agent step (CTR-8b) ───────────────────────────────
//
// The ladder's step 2 is an AGENT rung ("AI Risk Review"). Wiring the
// ladder (CTR-8) started it but never ran it — the rung sat as an inert
// PENDING task. This handler makes it real: it runs the SAME deterministic
// clause-derived risk read the repository already trusts (scoreContractClauses)
// and returns it as advisory findings. Governance is unchanged — the engine
// stores findings on the task and NEVER advances the ladder; a human reviewer
// still approves the rung (agent-tasks.ts guarantees this).

/** Turn a deterministic risk score into advisory ladder findings. */
export function findingsFromRisk(risk: ClauseRiskScore): AgentTaskFindings {
  if (risk.score == null) {
    return {
      confidence: 0.5,
      suggestedAction: "review-manually",
      summary: "No extracted clauses to assess — a reviewer should evaluate this contract manually.",
      detail: { score: null, band: risk.band, clauseCount: 0, deviationCount: 0, drivers: [], breakdown: risk.breakdown },
    };
  }
  // Higher risk ⇒ lower confidence ⇒ the step ESCALATES (below the 0.8 bar)
  // so the human reviewer scrutinises it; a clean, deviation-free contract
  // clears the bar (DONE) and the reviewer can rubber-stamp. Either way the
  // human still approves — DONE/ESCALATED only signals how hard to look.
  const deviationPenalty = risk.deviationCount > 0 ? 0.1 : 0;
  const confidence = Math.max(0, Math.min(1, 1 - risk.score / 100 - deviationPenalty));
  const suggestedAction = risk.band === "LOW" ? "approve" : risk.band === "MEDIUM" ? "review-deviations" : "escalate";
  const driverText = risk.drivers.slice(0, 3).map((d) => `${d.type}${d.deviation ? " (deviation)" : ""}`).join(", ");
  const summary =
    `Clause risk ${risk.band} — score ${risk.score}/100 across ${risk.clauseCount} clause(s), ` +
    `${risk.deviationCount} deviation(s).${driverText ? ` Top drivers: ${driverText}.` : ""}`;
  return {
    confidence,
    suggestedAction,
    summary,
    detail: {
      score: risk.score,
      band: risk.band,
      clauseCount: risk.clauseCount,
      deviationCount: risk.deviationCount,
      drivers: risk.drivers,
      breakdown: risk.breakdown,
    },
  };
}

/**
 * Ladder AGENT-step handler: score the contract's clauses and return advisory
 * findings. Resolves the contract from the instance context's `contract_id`
 * (stored at submit time). Deterministic and total — never throws on a
 * clause-less contract.
 */
export async function contractRiskAgentHandler(input: AgentTaskInput): Promise<AgentTaskFindings> {
  const ctx = (input?.context ?? {}) as Record<string, unknown>;
  const contractId = typeof ctx.contract_id === "string" ? ctx.contract_id : null;
  if (!contractId) throw new Error("No contract_id in approval ladder context");
  const clauses = await prisma.contractClause.findMany({
    where: { contractId },
    select: { type: true, risk: true, deviation: true },
  });
  const risk = scoreContractClauses(
    clauses.map((c) => ({ type: c.type, risk: c.risk as RiskLevel, deviation: c.deviation })),
  );
  return findingsFromRisk(risk);
}

// Run the AI Risk Review step now, if the ladder is sitting on a PENDING
// AGENT task. Best-effort and idempotent (autoRunCurrentAgentStep only runs a
// PENDING task at the current step); a run failure never breaks the caller.
async function autoRunApprovalAgent(instanceId: string): Promise<void> {
  await autoRunCurrentAgentStep(instanceId, contractRiskAgentHandler).catch(() => {});
}

export type ContractApprovalActor = { id: string; type?: "USER" | "AGENT" | "SYSTEM" };

export interface ApprovalStepFindingsDTO {
  status: "PENDING" | "RUNNING" | "DONE" | "ESCALATED" | "FAILED";
  confidence: number | null;
  suggestedAction: string | null;
  summary: string | null;
  band: string | null;
  score: number | null;
  deviationCount: number | null;
  drivers: Array<{ type: string; risk: string; deviation: boolean; points: number }>;
  minConfidence: number | null;
}

export interface ApprovalStepDTO {
  stepOrder: number;
  name: string;
  kind: "HUMAN" | "AGENT";
  approverRole: string | null;
  slaHours: number | null;
  state: "done" | "current" | "upcoming";
  rag: "GREEN" | "AMBER" | "RED" | null;
  /** Advisory AI Risk Review output, present only on an AGENT step that ran. */
  findings: ApprovalStepFindingsDTO | null;
}

type AgentTaskRow = { stepOrder: number; status: string; outputJson: unknown };

function toFindings(task: AgentTaskRow | undefined): ApprovalStepFindingsDTO | null {
  if (!task) return null;
  const out = (task.outputJson ?? {}) as Record<string, unknown>;
  const detail = (out.detail ?? {}) as Record<string, unknown>;
  return {
    status: task.status as ApprovalStepFindingsDTO["status"],
    confidence: typeof out.confidence === "number" ? out.confidence : null,
    suggestedAction: typeof out.suggestedAction === "string" ? out.suggestedAction : null,
    summary: typeof out.summary === "string" ? out.summary : null,
    band: typeof detail.band === "string" ? detail.band : null,
    score: typeof detail.score === "number" ? detail.score : null,
    deviationCount: typeof detail.deviationCount === "number" ? detail.deviationCount : null,
    drivers: Array.isArray(detail.drivers) ? (detail.drivers as ApprovalStepFindingsDTO["drivers"]) : [],
    minConfidence: typeof out.minConfidence === "number" ? out.minConfidence : null,
  };
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

export function mapSteps(
  instance: {
    status: string;
    currentStepOrder: number;
    definition: { steps: Array<{ stepOrder: number; name: string; kind: string; approverRole: string | null; slaHours: number | null }> };
  },
  tasks: AgentTaskRow[] = [],
): ApprovalStepDTO[] {
  const completed = instance.status === "COMPLETED";
  const rags = ragByStep(instance);
  // Latest task per step order wins (tasks arrive oldest-first).
  const latestByStep = new Map<number, AgentTaskRow>();
  for (const t of tasks) latestByStep.set(t.stepOrder, t);
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
        findings: s.kind === "AGENT" ? toFindings(latestByStep.get(s.stepOrder)) : null,
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

  const tasks = (await listAgentTasksForInstance(active.id)) as AgentTaskRow[];
  const steps = mapSteps(active as never, tasks);
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

  // The ladder now sits on the "AI Risk Review" AGENT rung — run it so its
  // advisory findings are ready the moment the reviewer opens the workspace.
  await autoRunApprovalAgent(instance.id);

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

/**
 * Manually (re-)run the AI Risk Review rung — the panel's "Run AI review"
 * affordance and a robustness path when the submit-time auto-run failed
 * (e.g. a transient DB hiccup). No-op unless a ladder is running with a
 * PENDING AGENT task at its current step. Returns the refreshed state.
 */
export async function runContractApprovalAgent(
  organizationId: string,
  contractId: string,
): Promise<ContractApprovalStateDTO> {
  const instances = await listInstancesForEntity(organizationId, ENTITY_TYPE, contractId);
  const active = instances.find((i) => i.status === "IN_PROGRESS");
  if (active) await autoRunApprovalAgent(active.id);
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

  // If the ladder is still running and has landed back on the AI Risk Review
  // rung (e.g. a send-back to step 1 then re-approve), run it again so fresh
  // findings are ready. Idempotent + best-effort.
  if (result.status === "IN_PROGRESS") await autoRunApprovalAgent(active.id);

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
